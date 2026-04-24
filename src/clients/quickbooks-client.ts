import dotenv from "dotenv";
import QuickBooks from "node-quickbooks";
import OAuthClient from "intuit-oauth";
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import open from 'open';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Resolve .env relative to the installed module (../../.env from dist/clients/).
// This matters when the MCP server is spawned by a host (e.g. Claude Desktop,
// Claude Code, Cursor) whose working directory is not the project root —
// without this, dotenv silently finds nothing and startup fails.
// (from PR #40)
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const client_id = process.env.QUICKBOOKS_CLIENT_ID;
const client_secret = process.env.QUICKBOOKS_CLIENT_SECRET;
const refresh_token = process.env.QUICKBOOKS_REFRESH_TOKEN;
const realm_id = process.env.QUICKBOOKS_REALM_ID;
const environment = process.env.QUICKBOOKS_ENVIRONMENT || 'sandbox';
const redirect_uri = process.env.QUICKBOOKS_REDIRECT_URI || 'http://localhost:8000/callback';

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

  // Shared in-flight refresh promise so concurrent callers all await the same
  // network request rather than racing to use (and rotate) the token.
  // (from PR #40)
  private refreshInFlight?: Promise<{ access_token: string; expires_in: number }>;

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

  private async startOAuthFlow(): Promise<void> {
    if (this.isAuthenticating) {
      return;
    }

    this.isAuthenticating = true;
    const port = 8000;

    return new Promise((resolve, reject) => {
      const server = http.createServer(async (req, res) => {
        // Log every incoming request for diagnostics (useful for ngrok flows)
        // (from PR #40)
        console.log(`[auth-server] ${req.method} ${req.url}`);

        // Respond to non-callback requests so diagnostic probes (curl, ngrok
        // health checks, favicon fetches) don't hang. (from PR #40)
        if (!req.url?.startsWith('/callback')) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Not Found. Waiting for QuickBooks OAuth callback at /callback');
          return;
        }

        try {
          const response = await this.oauthClient.createToken(req.url);
          const tokens = response.token;

          this.refreshToken = tokens.refresh_token;
          this.realmId = tokens.realmId;
          this.saveTokensToEnv();

          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(`
            <html>
              <body style="display:flex;flex-direction:column;justify-content:center;align-items:center;height:100vh;margin:0;font-family:Arial,sans-serif;background-color:#f5f5f5;">
                <h2 style="color:#2E8B57;">&#10003; Successfully connected to QuickBooks!</h2>
                <p>You can close this window now.</p>
              </body>
            </html>
          `);

          setTimeout(() => {
            server.close();
            this.isAuthenticating = false;
            resolve();
          }, 1000);
        } catch (error) {
          console.error('Error during token creation:', error);
          res.writeHead(500, { 'Content-Type': 'text/html' });
          res.end(`<html><body><h2>Error connecting to QuickBooks</h2></body></html>`);
          this.isAuthenticating = false;
          reject(error);
        }
      });

      // Bind to all interfaces (IPv4 + IPv6) so ngrok can reach it regardless
      // of whether localhost resolves to 127.0.0.1 or ::1. (from PR #40)
      server.listen(port, '::', async () => {
        const addr = server.address();
        console.log(`[auth-server] Listening on ${typeof addr === 'string' ? addr : `${addr?.address}:${addr?.port}`} (family: ${typeof addr === 'object' ? addr?.family : 'n/a'})`);

        const authUri = this.oauthClient.authorizeUri({
          scope: [OAuthClient.scopes.Accounting as string],
          state: 'testState'
        }).toString();

        // Always log the URL so headless users can copy-paste it. (from PR #40)
        console.log('\n=== QuickBooks Authorization ===');
        console.log('Open this URL in a browser to authorize:\n');
        console.log(authUri);
        console.log('\nWaiting for callback...\n');

        // Attempt to open browser; ignore failures on headless systems. (from PR #40)
        try {
          await open(authUri);
        } catch {
          // Headless environment — user will open the URL manually
        }
      });

      // Surface async failures instead of silently exiting. (from PR #40)
      process.on('uncaughtException', (err) => {
        console.error('[auth-server] uncaughtException:', err);
      });
      process.on('unhandledRejection', (reason) => {
        console.error('[auth-server] unhandledRejection:', reason);
      });

      server.on('error', (error) => {
        console.error('Server error:', error);
        this.isAuthenticating = false;
        reject(error);
      });
    });
  }

  private saveTokensToEnv(): void {
    const tokenPath = path.join(__dirname, '..', '..', '.env');
    const envContent = fs.existsSync(tokenPath) ? fs.readFileSync(tokenPath, 'utf-8') : '';
    const envLines = envContent.split('\n');

    const updateEnvVar = (name: string, value: string) => {
      const index = envLines.findIndex(line => line.startsWith(`${name}=`));
      if (index !== -1) {
        envLines[index] = `${name}=${value}`;
      } else {
        envLines.push(`${name}=${value}`);
      }
    };

    if (this.refreshToken) updateEnvVar('QUICKBOOKS_REFRESH_TOKEN', this.refreshToken);
    if (this.realmId) updateEnvVar('QUICKBOOKS_REALM_ID', this.realmId);

    // Atomic write: write to a sibling temp file then rename. On POSIX rename
    // is atomic within the same filesystem, so a crash mid-write cannot leave
    // .env half-written or empty. (from PR #40)
    const tmpPath = `${tokenPath}.tmp.${process.pid}`;
    try {
      fs.writeFileSync(tmpPath, envLines.join('\n'), { mode: 0o600 });
      fs.renameSync(tmpPath, tokenPath);
    } catch (err) {
      try { fs.unlinkSync(tmpPath); } catch { /* best effort */ }
      throw err;
    }
  }

  async refreshAccessToken(): Promise<{ access_token: string; expires_in: number }> {
    if (!this.refreshToken) {
      await this.startOAuthFlow();
      if (!this.refreshToken) {
        throw new Error('Failed to obtain refresh token from OAuth flow');
      }
    }

    // Return shared in-flight promise if a refresh is already underway,
    // preventing concurrent callers from racing on the same token. (from PR #40)
    if (this.refreshInFlight) {
      return this.refreshInFlight;
    }

    this.refreshInFlight = (async () => {
      try {
        const authResponse = await this.oauthClient.refreshUsingToken(this.refreshToken!);

        // The intuit-oauth type declarations are incomplete — the runtime token
        // object also contains refresh_token, x_refresh_token_expires_in, etc.
        // Widen the type to reach those fields. (from PR #40)
        const token = authResponse.token as unknown as {
          access_token: string;
          expires_in?: number;
          refresh_token?: string;
          x_refresh_token_expires_in?: number;
        };

        this.accessToken = token.access_token;

        const expiresIn = token.expires_in || 3600;
        this.accessTokenExpiry = new Date(Date.now() + expiresIn * 1000);

        // Intuit rotates the refresh token (typically every ~24h). When a new
        // one is issued we MUST persist it — the old value becomes stale and
        // will eventually stop working. (from PR #40)
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

        // Warn when the refresh token is approaching its 100-day expiry. (from PR #40)
        const refreshExpiresIn = token.x_refresh_token_expires_in;
        if (typeof refreshExpiresIn === 'number' && refreshExpiresIn < 14 * 24 * 3600) {
          const days = Math.round(refreshExpiresIn / 86400);
          console.error(`[qbo-client] WARNING: refresh token expires in ~${days} day(s). Re-run \`npm run auth\` before it expires.`);
        }

        return { access_token: this.accessToken!, expires_in: expiresIn };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to refresh Quickbooks token: ${message}`);
      } finally {
        this.refreshInFlight = undefined;
      }
    })();

    return this.refreshInFlight;
  }

  async authenticate(): Promise<QuickBooks> {
    if (!this.refreshToken || !this.realmId) {
      await this.startOAuthFlow();
      if (!this.refreshToken || !this.realmId) {
        throw new Error('Failed to obtain required tokens from OAuth flow');
      }
    }

    // Silently refresh if token is expired or expiring soon
    if (this.isTokenExpiredOrExpiringSoon()) {
      await this.refreshAccessToken();
    }

    // Always rebuild with the current fresh access token
    this.quickbooksInstance = new QuickBooks(
      this.clientId,
      this.clientSecret,
      this.accessToken!,
      false,
      this.realmId!,
      this.environment === 'sandbox',
      false,
      null,
      '2.0',
      this.refreshToken
    );

    return this.quickbooksInstance;
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

  getQuickbooks(): QuickBooks {
    if (!this.quickbooksInstance) {
      throw new Error('QuickBooks not authenticated. Call authenticate() first');
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
