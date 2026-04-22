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
// This matters when the MCP server is spawned by a host (e.g. Claude Code,
// Cursor) whose working directory is not the project root — without this,
// dotenv silently finds nothing and startup fails.
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const client_id = process.env.QUICKBOOKS_CLIENT_ID;
const client_secret = process.env.QUICKBOOKS_CLIENT_SECRET;
const refresh_token = process.env.QUICKBOOKS_REFRESH_TOKEN;
const realm_id = process.env.QUICKBOOKS_REALM_ID;
const environment = process.env.QUICKBOOKS_ENVIRONMENT || 'sandbox';
// Fix for Issue #5: Use env var with underscore (QUICKBOOKS_REDIRECT_URI)
const redirect_uri = process.env.QUICKBOOKS_REDIRECT_URI || 'http://localhost:8000/callback';

// Only throw error if client_id or client_secret is missing
if (!client_id || !client_secret || !redirect_uri) {
  throw Error("Client ID, Client Secret and Redirect URI must be set in environment variables");
}

class QuickbooksClient {
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

  private async startOAuthFlow(): Promise<void> {
    if (this.isAuthenticating) {
      return;
    }

    this.isAuthenticating = true;
    const port = 8000;

    return new Promise((resolve, reject) => {
      // Create temporary server for OAuth callback
      const server = http.createServer(async (req, res) => {
        console.log(`[auth-server] ${req.method} ${req.url}`);

        // Respond to anything that isn't /callback so diagnostic probes (curl,
        // ngrok health checks, favicon requests, etc.) don't hang the server.
        if (!req.url?.startsWith('/callback')) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Not Found. Waiting for QuickBooks OAuth callback at /callback');
          return;
        }

        {
          try {
            const response = await this.oauthClient.createToken(req.url);
            const tokens = response.token;
            
            // Save tokens
            this.refreshToken = tokens.refresh_token;
            this.realmId = tokens.realmId;
            this.saveTokensToEnv();
            
            // Send success response
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(`
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
            `);
            
            // Close server after a short delay
            setTimeout(() => {
              server.close();
              this.isAuthenticating = false;
              resolve();
            }, 1000);
          } catch (error) {
            console.error('Error during token creation:', error);
            res.writeHead(500, { 'Content-Type': 'text/html' });
            res.end(`
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
            `);
            this.isAuthenticating = false;
            reject(error);
          }
        }
      });

      // Start server — bind to all interfaces (IPv4 + IPv6) so ngrok can reach it
      // regardless of whether it resolves `localhost` to 127.0.0.1 or ::1
      server.listen(port, '::', async () => {
        const addr = server.address();
        console.log(`[auth-server] Listening on ${typeof addr === 'string' ? addr : `${addr?.address}:${addr?.port}`} (family: ${typeof addr === 'object' ? addr?.family : 'n/a'})`);

        // Generate authorization URL with proper type assertion
        const authUri = this.oauthClient.authorizeUri({
          scope: [OAuthClient.scopes.Accounting as string],
          state: 'testState'
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

      // Surface any uncaught issues so the process doesn't silently exit
      process.on('uncaughtException', (err) => {
        console.error('[auth-server] uncaughtException:', err);
      });
      process.on('unhandledRejection', (reason) => {
        console.error('[auth-server] unhandledRejection:', reason);
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

    // Atomic write: write to a sibling temp file, then rename. On POSIX rename
    // is atomic within the same filesystem, so a crash mid-write cannot leave
    // .env half-written or empty.
    const tmpPath = `${tokenPath}.tmp.${process.pid}`;
    try {
      fs.writeFileSync(tmpPath, envLines.join('\n'), { mode: 0o600 });
      fs.renameSync(tmpPath, tokenPath);
    } catch (err) {
      try { fs.unlinkSync(tmpPath); } catch { /* best effort */ }
      throw err;
    }
  }

  // Shared in-flight refresh promise so that concurrent callers all await the
  // same network request rather than racing to use (and rotate) the refresh
  // token simultaneously.
  private refreshInFlight?: Promise<{ access_token: string; expires_in: number }>;

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
        // At this point we know refreshToken is not undefined
        const authResponse = await this.oauthClient.refreshUsingToken(this.refreshToken!);

        // The intuit-oauth type declarations are incomplete — the runtime
        // token object also contains refresh_token, x_refresh_token_expires_in,
        // token_type, realmId, etc. Widen the type to reach those fields.
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
          console.error(`[qbo-client] WARNING: refresh token expires in ~${days} day(s). Re-run \`npm run auth\` before it expires.`);
        }

        return {
          access_token: this.accessToken!,
          expires_in: expiresIn,
        };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to refresh Quickbooks token: ${message}`);
      } finally {
        this.refreshInFlight = undefined;
      }
    })();

    return this.refreshInFlight;
  }

  async authenticate() {
    if (!this.refreshToken || !this.realmId) {
      await this.startOAuthFlow();
      
      // Verify we have both tokens after OAuth flow
      if (!this.refreshToken || !this.realmId) {
        throw new Error('Failed to obtain required tokens from OAuth flow');
      }
    }

    // Check if token exists and is still valid
    const now = new Date();
    if (!this.accessToken || !this.accessTokenExpiry || this.accessTokenExpiry <= now) {
      const tokenResponse = await this.refreshAccessToken();
      this.accessToken = tokenResponse.access_token;
    }
    
    // At this point we know all tokens are available
    this.quickbooksInstance = new QuickBooks(
      this.clientId,
      this.clientSecret,
      this.accessToken,
      false, // no token secret for OAuth 2.0
      this.realmId!, // Safe to use ! here as we checked above
      this.environment === 'sandbox', // use the sandbox?
      false, // debug?
      null, // minor version
      '2.0', // oauth version
      this.refreshToken
    );
    
    return this.quickbooksInstance;
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
