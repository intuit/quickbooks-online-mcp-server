import dotenv from "dotenv";
import QuickBooks from "node-quickbooks";
import OAuthClient from "intuit-oauth";
import http from 'http';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import open from 'open';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Where the server reads .env at startup and persists rotated refresh tokens.
// Defaults to the installed module's ../../.env (dist/clients/ -> package root)
// so a host-spawned server with an unrelated cwd still finds it. Override with
// QUICKBOOKS_TOKEN_STORE_PATH (an absolute path) to point at a WRITABLE location.
// This is required whenever the module itself lives on a read-only filesystem —
// containers with a read-only root, Nix/immutable installs (see #63, where the
// default path can't be written) — and lets a per-tenant host keep each
// connection's rotated token in its own isolated path.
//
// NOTE: this value is resolved BEFORE dotenv loads the file below, so the
// override only takes effect when set in the host process env (e.g. the MCP
// server config's env block) — setting it inside .env has no effect. It must
// be absolute: a relative path would resolve against the host app's working
// directory, which is unpredictable (the exact failure the module-relative
// default exists to avoid).
const tokenStorePathOverride = process.env.QUICKBOOKS_TOKEN_STORE_PATH?.trim();
if (tokenStorePathOverride && !path.isAbsolute(tokenStorePathOverride)) {
  throw Error(
    `QUICKBOOKS_TOKEN_STORE_PATH must be an absolute path, got "${tokenStorePathOverride}"`
  );
}
const TOKEN_STORE_PATH =
  tokenStorePathOverride || path.join(__dirname, '..', '..', '.env');

// Intuit's app security requirements mandate that the refresh token be
// encrypted at rest with a symmetric algorithm (AES preferred) and that the key
// live in a SEPARATE configuration file from the ciphertext. So the token store
// holds only QUICKBOOKS_REFRESH_TOKEN_ENC, and the AES-256 key sits beside it in
// its own 0600 file. Keeping them apart means a leaked token store — the file
// most likely to be copied, backed up, or accidentally committed — is inert on
// its own.
//
// The encrypted value uses a DISTINCT variable name rather than overloading
// QUICKBOOKS_REFRESH_TOKEN: a half-migrated store would otherwise feed
// ciphertext to Intuit (or plaintext to the decryptor) with no way to tell which
// it was holding.
const TOKEN_KEY_PATH = path.join(path.dirname(TOKEN_STORE_PATH), '.qbo-token-key');
const ENC_TOKEN_VAR = 'QUICKBOOKS_REFRESH_TOKEN_ENC';
const PLAINTEXT_TOKEN_VAR = 'QUICKBOOKS_REFRESH_TOKEN';

// Read the AES key, or undefined when no key file exists yet. Throws on a key
// file that exists but is unusable — a truncated or corrupted key must be loud,
// since silently treating it as "absent" would mint a NEW key and orphan the
// already-encrypted token.
function loadTokenKey(): Buffer | undefined {
  let raw: string;
  try {
    raw = fs.readFileSync(TOKEN_KEY_PATH, 'utf-8');
  } catch (e: any) {
    if (e?.code === 'ENOENT') return undefined;
    throw e;
  }
  const key = Buffer.from(raw.trim(), 'base64');
  if (key.length !== 32) {
    throw new Error(
      `Token encryption key at ${TOKEN_KEY_PATH} is not a 32-byte base64 AES-256 key ` +
      `(decoded ${key.length} bytes). Refusing to continue — delete the file to mint a ` +
      `new key, but note that any existing ${ENC_TOKEN_VAR} value becomes unreadable and ` +
      `the company must be re-authorized.`
    );
  }
  return key;
}

function getOrCreateTokenKey(): Buffer {
  const existing = loadTokenKey();
  if (existing) return existing;

  const key = crypto.randomBytes(32);
  fs.mkdirSync(path.dirname(TOKEN_KEY_PATH), { recursive: true });
  try {
    // 'wx' fails rather than truncating if a sibling process created the key
    // between our read and this write. Losing that race by clobbering would
    // leave the winner's ciphertext undecryptable, so the loser adopts the
    // key that is already on disk instead.
    fs.writeFileSync(TOKEN_KEY_PATH, key.toString('base64'), { mode: 0o600, flag: 'wx' });
  } catch (e: any) {
    if (e?.code === 'EEXIST') {
      const raced = loadTokenKey();
      if (raced) return raced;
    }
    throw e;
  }
  // writeFileSync's mode is masked by the process umask, so restate it.
  try { fs.chmodSync(TOKEN_KEY_PATH, 0o600); } catch { /* best effort */ }
  return key;
}

// AES-256-GCM — authenticated, so a tampered or truncated blob fails to decrypt
// rather than yielding garbage that we would send to Intuit as a credential.
// Serialized as base64(iv):base64(authTag):base64(ciphertext); base64 never
// contains ':', so the delimiter is unambiguous.
function encryptRefreshToken(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getOrCreateTokenKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()]);
  return [
    iv.toString('base64'),
    cipher.getAuthTag().toString('base64'),
    ciphertext.toString('base64'),
  ].join(':');
}

function decryptRefreshToken(blob: string): string {
  const key = loadTokenKey();
  if (!key) {
    throw new Error(
      `${ENC_TOKEN_VAR} is set but no encryption key exists at ${TOKEN_KEY_PATH}. ` +
      `The key file must accompany the token store; without it the token cannot be recovered.`
    );
  }
  const parts = blob.split(':');
  if (parts.length !== 3) {
    throw new Error(`${ENC_TOKEN_VAR} is malformed (expected iv:authTag:ciphertext)`);
  }
  const [iv, authTag, ciphertext] = parts.map((p) => Buffer.from(p, 'base64'));
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf-8');
}

// Resolve the usable refresh token from a bag of env-style values, preferring
// the encrypted form and falling back to a not-yet-migrated plaintext one.
// A decrypt failure yields undefined rather than throwing: the server then
// treats the token as absent and takes its normal re-authorize path, which is
// the only real remedy anyway.
function resolveRefreshToken(vars: Record<string, string | undefined>): string | undefined {
  const encrypted = vars[ENC_TOKEN_VAR]?.trim();
  if (encrypted) {
    try {
      return decryptRefreshToken(encrypted) || undefined;
    } catch (e) {
      console.error('[qbo-client] Failed to decrypt stored refresh token:', e instanceof Error ? e.message : e);
      return undefined;
    }
  }
  return vars[PLAINTEXT_TOKEN_VAR]?.trim() || undefined;
}

// Rewrite the token store, setting `updates` and dropping `removeNames`.
// Shared by saveTokensToEnv() and the plaintext migration so both get the same
// atomic-write and symlink-target handling.
function writeTokenStore(updates: Record<string, string>, removeNames: string[] = []): void {
  const tokenPath = TOKEN_STORE_PATH;
  const envContent = fs.existsSync(tokenPath) ? fs.readFileSync(tokenPath, 'utf-8') : '';
  let envLines = envContent.split('\n');

  for (const [name, value] of Object.entries(updates)) {
    const index = envLines.findIndex((line) => line.startsWith(`${name}=`));
    if (index !== -1) {
      envLines[index] = `${name}=${value}`;
    } else {
      envLines.push(`${name}=${value}`);
    }
  }
  if (removeNames.length > 0) {
    envLines = envLines.filter((line) => !removeNames.some((name) => line.startsWith(`${name}=`)));
  }

  const newContent = envLines.join('\n');

  if (isSymbolicLink(tokenPath)) {
    // Write directly through the symlink to the real target. Using
    // rename on a symlink replaces the link itself rather than writing
    // through it, which breaks persistent-volume mounts in containers.
    // If the symlink target doesn't exist yet (fresh PVC mount), resolve
    // the link target without requiring it to exist, then write directly.
    let realPath: string;
    try {
      realPath = fs.realpathSync(tokenPath);
    } catch (e: any) {
      if (e?.code === 'ENOENT') {
        // Dangling symlink: target doesn't exist yet. readlinkSync returns the
        // link target as stored, which may be RELATIVE — and a relative path is
        // resolved against the process cwd, not the link's own directory. Resolve
        // it against the symlink's directory so we write to the intended location.
        const linkTarget = fs.readlinkSync(tokenPath);
        realPath = path.isAbsolute(linkTarget)
          ? linkTarget
          : path.resolve(path.dirname(tokenPath), linkTarget);
      } else {
        throw e;
      }
    }
    // Deliberate: no temp-file+rename here. Renaming over a symlink replaces the
    // link itself (the bug this branch fixes), so we write through to the target
    // directly. This trades atomicity for correct persistent-volume behavior — a
    // crash mid-write could leave the target .env partially written.
    fs.writeFileSync(realPath, newContent, { mode: 0o600 });
  } else {
    // Atomic write: write to a sibling temp file, then rename. On POSIX
    // rename is atomic within the same filesystem, so a crash mid-write
    // cannot leave .env half-written or empty.
    const tmpPath = `${tokenPath}.tmp.${process.pid}`;
    try {
      fs.writeFileSync(tmpPath, newContent, { mode: 0o600 });
      fs.renameSync(tmpPath, tokenPath);
    } catch (err) {
      try { fs.unlinkSync(tmpPath); } catch { /* best effort */ }
      throw err;
    }
  }
}

function isSymbolicLink(filePath: string): boolean {
  try {
    return fs.lstatSync(filePath).isSymbolicLink();
  } catch {
    return false;
  }
}

// One-shot upgrade for stores written before at-rest encryption existed: read
// the plaintext token, write it back encrypted, and drop the plaintext line.
// Best-effort — a read-only or otherwise unwritable store must not stop the
// server from booting on a token it can still use.
function migratePlaintextRefreshToken(): void {
  let stored: Record<string, string>;
  try {
    stored = dotenv.parse(fs.readFileSync(TOKEN_STORE_PATH));
  } catch {
    return;
  }
  if (stored?.[ENC_TOKEN_VAR]?.trim()) return;
  const plaintext = stored?.[PLAINTEXT_TOKEN_VAR]?.trim();
  if (!plaintext) return;

  try {
    const encrypted = encryptRefreshToken(plaintext);
    writeTokenStore({ [ENC_TOKEN_VAR]: encrypted }, [PLAINTEXT_TOKEN_VAR]);
    // Keep process.env consistent with what is now on disk, so the resolution
    // below reads the same state a fresh start would.
    process.env[ENC_TOKEN_VAR] = encrypted;
    delete process.env[PLAINTEXT_TOKEN_VAR];
    console.error('[qbo-client] Migrated plaintext refresh token to encrypted at-rest storage');
  } catch (e) {
    console.error('[qbo-client] Failed to migrate plaintext refresh token to encrypted storage:', e);
  }
}

// Use override: true so that values from the token store always win over any
// empty-string placeholders a host app (e.g. Claude Desktop) may inject via
// its env config. This prevents the server from starting with blank
// REFRESH_TOKEN / REALM_ID even when the host config has those keys set to "".
dotenv.config({ path: TOKEN_STORE_PATH, override: true });

migratePlaintextRefreshToken();

// Register once at module level — registering inside startOAuthFlow() would
// accumulate duplicate handlers on every OAuth call.
process.on('uncaughtException', (err) => {
  console.error('[auth-server] uncaughtException:', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[auth-server] unhandledRejection:', reason);
});

const client_id = process.env.QUICKBOOKS_CLIENT_ID;
const client_secret = process.env.QUICKBOOKS_CLIENT_SECRET;
const refresh_token = resolveRefreshToken(process.env);
const realm_id = process.env.QUICKBOOKS_REALM_ID;
const environment = process.env.QUICKBOOKS_ENVIRONMENT || 'sandbox';
// Fix for Issue #5: Use env var with underscore (QUICKBOOKS_REDIRECT_URI)
const redirect_uri = process.env.QUICKBOOKS_REDIRECT_URI || 'http://localhost:8000/callback';

// Only throw error if client_id or client_secret is missing
if (!client_id || !client_secret || !redirect_uri) {
  throw Error("Client ID, Client Secret and Redirect URI must be set in environment variables");
}

// ── QuickbooksClient ─────────────────────────────────────────────────────────
// Exported so handlers can call QuickbooksClient.getInstance() directly,
// which checks token freshness on every invocation rather than only at startup.

export class QuickbooksClient {
  private readonly clientId: string;
  private readonly clientSecret: string;
  private refreshToken?: string;
  private realmId?: string;
  private readonly environment: string;
  private accessToken?: string;
  private accessTokenExpiry?: Date;
  private quickbooksInstance?: QuickBooks;
  private oauthClient: OAuthClient;
  private isAuthenticating: boolean = false;
  private redirectUri: string;

  // Refresh 5 minutes before actual expiry to avoid edge cases
  private static readonly TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;

  // Shared in-flight refresh promise so that concurrent callers all await the
  // same network request rather than racing to use (and rotate) the refresh
  // token simultaneously.
  private refreshInFlight?: Promise<{ access_token: string; expires_in: number }>;

  // Shared in-flight authenticate promise. Guards the cold-start path so two
  // concurrent first callers cannot both pass the freshness check and both
  // invoke startOAuthFlow() / rebuild the QuickBooks instance.
  private authInFlight?: Promise<QuickBooks>;

  constructor(config: {
    clientId: string;
    clientSecret: string;
    refreshToken?: string;
    realmId?: string;
    environment: string;
    redirectUri: string;
  }) {
    this.clientId = config.clientId;
    this.clientSecret = config.clientSecret;
    this.refreshToken = config.refreshToken;
    this.realmId = config.realmId;
    this.environment = config.environment;
    this.redirectUri = config.redirectUri;
    this.oauthClient = new OAuthClient({
      clientId: this.clientId,
      clientSecret: this.clientSecret,
      environment: this.environment,
      redirectUri: this.redirectUri,
    });
  }

  private isTokenExpiredOrExpiringSoon(): boolean {
    if (!this.accessToken || !this.accessTokenExpiry) return true;
    return this.accessTokenExpiry <= new Date(Date.now() + QuickbooksClient.TOKEN_REFRESH_BUFFER_MS);
  }

  // Read the refresh token currently persisted in the token store (.env by
  // default, or QUICKBOOKS_TOKEN_STORE_PATH). Used to pick up a rotation
  // performed by a SIBLING process before we attempt our own refresh: a host
  // may spawn this server more than once against the same store (e.g.
  // Claude Desktop and Claude Code simultaneously), and Intuit invalidates the
  // previous refresh token on every rotation — so a token loaded into memory at
  // startup can be silently superseded on disk by another process.
  private readPersistedRefreshToken(): string | undefined {
    try {
      // Parse with dotenv itself so the value is normalized identically to how
      // the in-memory token was loaded at startup — surrounding quotes stripped,
      // inline comments removed, optional `export ` prefix handled. A naive
      // slice would keep quotes/comments and could poison a valid token with a
      // value that only looks different.
      const parsed = dotenv.parse(fs.readFileSync(TOKEN_STORE_PATH));
      return resolveRefreshToken(parsed);
    } catch {
      return undefined;
    }
  }

  // Distinguish a genuinely dead refresh token (revoked, expired, or rotated
  // out — Intuit answers HTTP 400 invalid_grant, or 401) from a transient
  // failure (5xx, 429, network timeout). Only the former warrants telling the
  // operator to re-authorize; a transient failure must stay retryable so it
  // self-heals. Conservative: anything not clearly an auth-invalidation is
  // treated as transient, so an outage never produces a false "re-authorize"
  // alarm.
  //
  // NOTE on shape: intuit-oauth 4.x does NOT surface invalid_grant in a tidy
  // field. Verified empirically against v4.2.1 — on a rejected refresh token
  // the error's message/error is the axios string "Request failed with status
  // code 400", error_description is "", authResponse.response is "" and
  // authResponse.status is a function returning undefined. So the reliably
  // available signal is the HTTP status embedded in that message; we also check
  // any structured fields in case a future version populates them.
  private isAuthInvalidation(error: unknown): boolean {
    // Walk the error's cause chain (bounded) so a wrapped error still classifies
    // correctly regardless of how many layers deep the real signal sits — our
    // own wrapper adds one level, and some axios versions attach a `cause`.
    let cur: unknown = error;
    for (let depth = 0; depth < 4 && cur != null; depth++) {
      if (this.classifyOneError(cur)) return true;
      cur = (cur as { cause?: unknown }).cause;
    }
    return false;
  }

  // Classify a SINGLE error object (no cause traversal — the caller walks the
  // chain). Returns true only for a genuine auth-invalidation.
  private classifyOneError(raw: unknown): boolean {
    const asObj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;

    // Explicit OAuth error fields, when populated.
    const errField = String(asObj?.error ?? "").toLowerCase();
    const errDesc = String(asObj?.error_description ?? "").toLowerCase();
    if (errField.includes("invalid_grant") || errDesc.includes("invalid_grant")) return true;

    // Numeric HTTP status from whichever field carries it (incl. intuit-oauth's
    // authResponse.status() accessor).
    let status: number | undefined;
    const ar = asObj?.authResponse as { status?: unknown; response?: { status?: unknown } } | undefined;
    if (ar) {
      if (typeof ar.status === "function") {
        try {
          const s = Number((ar.status as () => unknown)());
          if (!Number.isNaN(s)) status = s;
        } catch {
          /* accessor threw — fall through to message parsing */
        }
      } else if (typeof ar.status === "number") {
        status = ar.status;
      }
      if (status === undefined && ar.response && typeof ar.response.status === "number") {
        status = ar.response.status;
      }
    }
    if (status === undefined && typeof asObj?.status === "number") status = asObj.status as number;

    // Fallback: parse the axios-style message ("Request failed with status code
    // NNN") — the only signal intuit-oauth 4.x reliably exposes on invalid_grant
    // (its response body is discarded). The \b prevents a 4-digit number from
    // matching its 3-digit prefix.
    const message = (raw instanceof Error ? raw.message : String(raw ?? "")).toLowerCase();
    if (message.includes("invalid_grant")) return true;
    if (status === undefined) {
      const m = message.match(/status code (\d{3})\b/);
      if (m) status = Number(m[1]);
    }

    return status === 400 || status === 401;
  }

  // Single refresh network call. Returns the widened token object — the
  // intuit-oauth type declarations omit refresh_token, x_refresh_token_expires_in,
  // token_type, realmId, etc.
  private async performRefresh(refreshToken: string): Promise<{
    access_token: string;
    expires_in?: number;
    refresh_token?: string;
    x_refresh_token_expires_in?: number;
  }> {
    const authResponse = await this.oauthClient.refreshUsingToken(refreshToken);
    return authResponse.token as unknown as {
      access_token: string;
      expires_in?: number;
      refresh_token?: string;
      x_refresh_token_expires_in?: number;
    };
  }

  // The actionable error surfaced when a production server's refresh token is
  // dead. The interactive localhost flow cannot recover it — Intuit rejects the
  // localhost redirect for production apps, and no human is present to complete
  // a browser login in a host-spawned stdio subprocess — so we fail with
  // instructions instead of opening a browser window that can never succeed.
  private reauthError(cause?: string): Error {
    const msg =
      'QuickBooks authorization is invalid or expired and cannot be renewed automatically in ' +
      'production. Re-authorize this company using a public HTTPS redirect (see the "Production ' +
      'Setup" section of the README), then restart the server. Note: an HTTP 401 from the token ' +
      'endpoint usually means invalid_client — verify QUICKBOOKS_CLIENT_ID and ' +
      'QUICKBOOKS_CLIENT_SECRET before re-authorizing.';
    return new Error(cause ? `${msg} (cause: ${cause})` : msg);
  }

  private async startOAuthFlow(): Promise<void> {
    // The interactive flow below binds a localhost callback server, but Intuit
    // rejects localhost redirect URIs for production apps — so this can only
    // ever succeed in sandbox. Fail fast with guidance rather than opening a
    // doomed browser window on a production server.
    if (this.environment === 'production') {
      throw this.reauthError();
    }

    if (this.isAuthenticating) {
      return;
    }

    this.isAuthenticating = true;
    const port = 8000;

    // The local server below receives the callback, so the authorize/exchange
    // pair must use the localhost redirect even when QUICKBOOKS_REDIRECT_URI
    // points elsewhere (e.g. the OAuth playground used for manual token
    // generation). Intuit rejects the exchange if the redirect_uri does not
    // match the one used in the authorize request.
    const flowClient = new OAuthClient({
      clientId: this.clientId,
      clientSecret: this.clientSecret,
      environment: this.environment,
      redirectUri: `http://localhost:${port}/callback`,
    });

    return new Promise((resolve, reject) => {
      // Guard against duplicate /callback requests for the same authorization
      // code. Browsers resolve `localhost` to both 127.0.0.1 and ::1, and the
      // server binds dual-stack (`::`), so the redirect frequently lands twice.
      // Exchanging a one-time auth code a second time trips Intuit's replay
      // protection, which REVOKES the tokens issued by the first exchange
      // (RFC 6749 §4.1.2). Only the first callback may exchange the code.
      let codeExchangeStarted = false;

      // Random per-run value, not guessable from the public repo. Bound to this
      // authorize request and checked against every callback before we exchange
      // anything, so a stranger who gets their own valid code for this client_id
      // (client IDs aren't secret) can't hijack the callback and have their
      // tokens written into our .env instead of ours.
      const expectedState = crypto.randomBytes(24).toString('hex');

      // Intuit's app security requirements forbid returning HTML at a URL that
      // carries the auth code/state, so /callback only ever 302s to one of these
      // param-free paths and the HTML is rendered there instead.
      const PROCESSING_PATH = '/callback/processing';
      const COMPLETE_PATH = '/callback/complete';
      const ERROR_PATH = '/callback/error';

      const resultPages: Record<string, { status: number; html: string }> = {
        [PROCESSING_PATH]: {
          status: 200,
          html: '<html><body style="font-family:Arial;text-align:center;margin-top:20vh"><h2>Processing… you can close this window.</h2></body></html>',
        },
        [COMPLETE_PATH]: {
          status: 200,
          html: `
              <html>
                <body style="
                  display: flex;
                  flex-direction: column;
                  justify-content: center;
                  align-items: center;
                  height: 100vh;
                  margin: 0;
                  font-family: Arial, sans-serif;
                  background-color: #f5f5f5;
                ">
                  <h2 style="color: #2E8B57;">✓ Successfully connected to QuickBooks!</h2>
                  <p>You can close this window now.</p>
                </body>
              </html>
            `,
        },
        [ERROR_PATH]: {
          status: 500,
          html: `
              <html>
                <body style="
                  display: flex;
                  flex-direction: column;
                  justify-content: center;
                  align-items: center;
                  height: 100vh;
                  margin: 0;
                  font-family: Arial, sans-serif;
                  background-color: #fff0f0;
                ">
                  <h2 style="color: #d32f2f;">Error connecting to QuickBooks</h2>
                  <p>Please check the console for more details.</p>
                </body>
              </html>
            `,
        },
      };

      // Only pages the flow has actually reached are servable, so a stray probe
      // can't render "success" before the exchange happened.
      const servablePages = new Set<string>();

      let settled = false;
      const shutdown = () => {
        if (settled) return;
        settled = true;
        server.close();
        this.isAuthenticating = false;
        resolve();
      };

      // Held until the browser has fetched the error page, so rejecting (which
      // exits the CLI) doesn't race the redirect the user is following.
      let pendingError: unknown;
      const fail = () => {
        if (settled) return;
        settled = true;
        this.isAuthenticating = false;
        reject(pendingError);
      };

      // Create temporary server for OAuth callback
      const server = http.createServer(async (req, res) => {
        console.log(`[auth-server] ${req.method} ${req.url}`);

        const requestUrl = req.url ?? '/';
        const pathname = new URL(requestUrl, `http://localhost:${port}`).pathname;

        const page = resultPages[pathname];
        if (page && servablePages.has(pathname)) {
          res.writeHead(page.status, { 'Content-Type': 'text/html' });
          res.end(page.html);
          if (pathname === COMPLETE_PATH) {
            setTimeout(shutdown, 1000);
          } else if (pathname === ERROR_PATH) {
            fail();
          }
          return;
        }

        // Respond to anything that isn't /callback so diagnostic probes (curl,
        // ngrok health checks, favicon requests, etc.) don't hang the server.
        if (pathname !== '/callback') {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Not Found. Waiting for QuickBooks OAuth callback at /callback');
          return;
        }

        // Reject any callback whose state doesn't match this run's authorize
        // request, before touching codeExchangeStarted, so a spoofed/scanner
        // hit can't consume the one-shot exchange lock and lock out the real
        // callback that follows it.
        const incomingState = new URL(requestUrl, `http://localhost:${port}`).searchParams.get('state');
        if (incomingState !== expectedState) {
          console.log(`[auth-server] Rejected callback with mismatched state (got: ${incomingState ?? 'none'})`);
          res.writeHead(400, { 'Content-Type': 'text/plain' });
          res.end('Invalid or missing state parameter.');
          return;
        }

        // A duplicate callback for the same code must NOT be exchanged again, or
        // Intuit revokes the token minted by the first hit. `codeExchangeStarted`
        // is set synchronously before the first `await`, so the second request's
        // handler observes it and bails out here.
        if (codeExchangeStarted) {
          servablePages.add(PROCESSING_PATH);
          res.writeHead(302, { Location: PROCESSING_PATH });
          res.end();
          return;
        }
        codeExchangeStarted = true;

        {
          try {
            const response = await flowClient.createToken(requestUrl);
            const tokens = response.token;

            // Save tokens
            this.refreshToken = tokens.refresh_token;
            this.realmId = tokens.realmId;
            this.saveTokensToEnv();

            // Send success response
            servablePages.add(COMPLETE_PATH);
            res.writeHead(302, { Location: COMPLETE_PATH });
            res.end();

            // Close server after a short delay, whether or not the browser
            // follows the redirect to the completion page.
            setTimeout(shutdown, 5000);
          } catch (error) {
            console.error('Error during token creation:', error);
            pendingError = error;
            servablePages.add(ERROR_PATH);
            res.writeHead(302, { Location: ERROR_PATH });
            res.end();
            setTimeout(fail, 5000);
          }
        }
      });

      // Start server — bind to all interfaces (IPv4 + IPv6) so ngrok can reach it
      // regardless of whether it resolves `localhost` to 127.0.0.1 or ::1
      server.listen(port, '::', async () => {
        const addr = server.address();
        console.log(`[auth-server] Listening on ${typeof addr === 'string' ? addr : `${addr?.address}:${addr?.port}`} (family: ${typeof addr === 'object' ? addr?.family : 'n/a'})`);

        // Generate authorization URL with proper type assertion
        const authUri = flowClient.authorizeUri({
          scope: [OAuthClient.scopes.Accounting as string],
          state: expectedState
        }).toString();

        console.log('\n=== QuickBooks Authorization ===');
        console.log('Open this URL in a browser to authorize:\n');
        console.log(authUri);
        console.log('\nWaiting for callback...\n');

        // Attempt to open the browser automatically; ignore failures on headless systems
        try {
          await open(authUri);
        } catch {
          // Headless environment — user will open the URL manually
        }
      });

      // Handle server errors
      server.on('error', (error) => {
        console.error('Server error:', error);
        this.isAuthenticating = false;
        reject(error);
      });
    });
  }

  private saveTokensToEnv(): void {
    const updates: Record<string, string> = {};
    // Always drop the legacy plaintext line alongside an encrypted write, so a
    // store that predates encryption can never keep serving a stale plaintext
    // token that resolveRefreshToken() would fall back to.
    const removeNames: string[] = [];

    if (this.refreshToken) {
      updates[ENC_TOKEN_VAR] = encryptRefreshToken(this.refreshToken);
      removeNames.push(PLAINTEXT_TOKEN_VAR);
    }
    // realmId is a company identifier, not a secret — Intuit's encryption
    // requirement covers the refresh token only, so this stays readable.
    if (this.realmId) updates['QUICKBOOKS_REALM_ID'] = this.realmId;

    writeTokenStore(updates, removeNames);
  }

  async refreshAccessToken() {
    if (!this.refreshToken) {
      await this.startOAuthFlow();

      // Verify we have a refresh token after OAuth flow
      if (!this.refreshToken) {
        throw new Error('Failed to obtain refresh token from OAuth flow');
      }
    }

    if (this.refreshInFlight) {
      return this.refreshInFlight;
    }

    this.refreshInFlight = (async () => {
      try {
        // Multi-process rotation-race fix. We refresh with our in-memory token
        // first and only consult .env AFTER it is rejected — so a valid token,
        // including one this process just rotated but could not persist, is
        // never proactively discarded. A sibling process sharing this .env may
        // have rotated the token (Intuit invalidates the prior one on
        // rotation); if the freshly-persisted disk value differs, retry once
        // with it, turning a concurrent-rotation loss into a success rather
        // than a spurious "token dead".
        let token;
        try {
          token = await this.performRefresh(this.refreshToken!);
        } catch (firstErr) {
          // Only consult disk when OUR token was actually rejected: a rejection
          // (invalid_grant/400/401) may mean a sibling rotated it, so the disk
          // value is worth a retry. A transient error (5xx/429/network) says
          // nothing about token validity — swapping the in-memory token for a
          // possibly-stale disk value on a mere blip could discard a valid
          // (e.g. rotated-but-unpersisted) token, so rethrow and let the caller
          // retry with the token intact.
          if (!this.isAuthInvalidation(firstErr)) {
            throw firstErr;
          }
          const latest = this.readPersistedRefreshToken();
          if (latest && latest !== this.refreshToken) {
            this.refreshToken = latest;
            token = await this.performRefresh(latest);
          } else {
            throw firstErr;
          }
        }

        this.accessToken = token.access_token;

        const expiresIn = token.expires_in || 3600;
        this.accessTokenExpiry = new Date(Date.now() + expiresIn * 1000);

        // Intuit rotates the refresh token (typically every ~24h). When a new
        // one is issued we MUST persist it — the old value in .env becomes
        // stale and will eventually stop working, silently breaking refresh.
        const newRefreshToken = token.refresh_token;
        if (newRefreshToken && newRefreshToken !== this.refreshToken) {
          this.refreshToken = newRefreshToken;
          try {
            this.saveTokensToEnv();
            console.error('[qbo-client] Refresh token rotated and persisted to .env');
          } catch (persistErr) {
            // Don't fail the whole refresh just because we couldn't write to
            // disk; the in-memory token is still valid for this process.
            console.error('[qbo-client] Failed to persist rotated refresh token:', persistErr);
          }
        }

        // Surface the refresh token's own remaining lifetime for observability.
        // Intuit's refresh tokens last 100 days; warn when under 14 days.
        const refreshExpiresIn = token.x_refresh_token_expires_in;
        if (typeof refreshExpiresIn === 'number' && refreshExpiresIn < 14 * 24 * 3600) {
          const days = Math.round(refreshExpiresIn / 86400);
          const renewHint = this.environment === 'production'
            ? 'Re-authorize before it expires (see README "Production Setup").'
            : 'Re-run `npm run auth` before it expires.';
          console.error(`[qbo-client] WARNING: refresh token expires in ~${days} day(s). ${renewHint}`);
        }

        return {
          access_token: this.accessToken!,
          expires_in: expiresIn,
        };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        // Preserve the original error as `cause` so the caller can classify it
        // (auth-invalidation vs transient) without re-parsing the message.
        // Assigned rather than passed to the constructor so this compiles
        // regardless of the configured TS lib target.
        const wrapped = new Error(`Failed to refresh Quickbooks token: ${message}`);
        (wrapped as Error & { cause?: unknown }).cause = error;
        throw wrapped;
      } finally {
        this.refreshInFlight = undefined;
      }
    })();

    return this.refreshInFlight;
  }

  async authenticate(): Promise<QuickBooks> {
    if (this.authInFlight) {
      return this.authInFlight;
    }

    this.authInFlight = (async () => {
      try {
        if (!this.refreshToken || !this.realmId) {
          await this.startOAuthFlow();

          // Verify we have both tokens after OAuth flow
          if (!this.refreshToken || !this.realmId) {
            throw new Error('Failed to obtain required tokens from OAuth flow');
          }
        }

        // Silently refresh if token is expired or expiring soon
        if (this.isTokenExpiredOrExpiringSoon()) {
          try {
            await this.refreshAccessToken();
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            // A transient failure (Intuit 5xx/429, network blip) says nothing
            // about token validity. In BOTH environments, rethrow it as-is so
            // the caller sees a retryable error and the preserved in-memory
            // token self-heals on the next request. Never discard a valid token
            // or launch a browser flow over a temporary outage.
            if (!this.isAuthInvalidation(error)) {
              throw error;
            }
            // Past here the refresh token is genuinely dead (revoked, expired
            // past the 100-day window, or rotated out).
            if (this.environment === 'production') {
              // The interactive fallback cannot help (localhost redirect is
              // rejected, and nobody is watching a host-spawned subprocess to
              // complete a browser login). Surface an actionable error.
              throw this.reauthError(message);
            }
            // Sandbox: recoverable via the localhost interactive OAuth flow.
            console.error(`[qbo-client] Refresh token rejected (${message}); falling back to interactive OAuth`);
            this.refreshToken = undefined;
            this.accessToken = undefined;
            this.accessTokenExpiry = undefined;
            // With no refresh token, refreshAccessToken() starts the OAuth
            // flow and then exchanges the newly obtained refresh token.
            await this.refreshAccessToken();
          }
        }

        // Always rebuild with the current fresh access token
        this.quickbooksInstance = new QuickBooks(
          this.clientId,
          this.clientSecret,
          this.accessToken!,
          false, // no token secret for OAuth 2.0
          this.realmId!,
          this.environment === 'sandbox',
          false, // debug?
          null,  // minor version
          '2.0', // oauth version
          this.refreshToken
        );

        return this.quickbooksInstance;
      } finally {
        this.authInFlight = undefined;
      }
    })();

    return this.authInFlight;
  }

  // ── Called by every handler on every request ─────────────────────────────
  // Checks token freshness on each invocation so handlers stay functional
  // across 60-minute token boundaries without server restarts.
  static async getInstance(): Promise<QuickBooks> {
    if (quickbooksClient.isTokenExpiredOrExpiringSoon()) {
      await quickbooksClient.authenticate();
    }
    if (!quickbooksClient.quickbooksInstance) {
      await quickbooksClient.authenticate();
    }
    return quickbooksClient.quickbooksInstance!;
  }

  // Static counterpart to getInstance() — returns raw OAuth credentials for
  // handlers that need to call QBO endpoints not wrapped by node-quickbooks
  // (e.g. POST /upload for binary attachments). Ensures token freshness on
  // every invocation, same as getInstance().
  static async getAuthCredentials(): Promise<{ accessToken: string; realmId: string; isSandbox: boolean }> {
    if (quickbooksClient.isTokenExpiredOrExpiringSoon() || !quickbooksClient.accessToken) {
      await quickbooksClient.authenticate();
    }
    if (!quickbooksClient.accessToken || !quickbooksClient.realmId) {
      throw new Error('Quickbooks not authenticated');
    }
    return {
      accessToken: quickbooksClient.accessToken,
      realmId: quickbooksClient.realmId,
      isSandbox: quickbooksClient.environment === 'sandbox',
    };
  }

  getQuickbooks() {
    if (!this.quickbooksInstance) {
      throw new Error('Quickbooks not authenticated. Call authenticate() first');
    }
    return this.quickbooksInstance;
  }
}

export const quickbooksClient = new QuickbooksClient({
  clientId: client_id,
  clientSecret: client_secret,
  refreshToken: refresh_token,
  realmId: realm_id,
  environment: environment,
  redirectUri: redirect_uri,
});
