import dotenv from "dotenv";
import QuickBooks from "node-quickbooks";
import OAuthClient from "intuit-oauth";
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import open from 'open';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const client_id = process.env.QUICKBOOKS_CLIENT_ID;
const client_secret = process.env.QUICKBOOKS_CLIENT_SECRET;
const refresh_token = process.env.QUICKBOOKS_REFRESH_TOKEN;
const realm_id = process.env.QUICKBOOKS_REALM_ID;
const environment = process.env.QUICKBOOKS_ENVIRONMENT || 'sandbox';
const redirect_uri = 'http://localhost:8000/callback';

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
        if (req.url?.startsWith('/callback')) {
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

      // Start server
      server.listen(port, async () => {
        
        // Generate authorization URL with proper type assertion
        const authUri = this.oauthClient.authorizeUri({
          scope: [OAuthClient.scopes.Accounting as string],
          state: 'testState'
        }).toString();
        
        // Open browser automatically
        await open(authUri);
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
    const envContent = fs.readFileSync(tokenPath, 'utf-8');
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

    fs.writeFileSync(tokenPath, envLines.join('\n'));
  }

  private reloadRefreshTokenFromEnv(): void {
    // Multiple processes (e.g. one MCP host per client) can each hold a
    // QuickbooksClient and refresh independently. Because QBO rotates the
    // refresh_token on every refresh, the in-memory copy in process A goes
    // stale the moment process B refreshes and persists the rotated value.
    // Re-reading .env right before we attempt a refresh lets process A pick
    // up the value process B just persisted, instead of failing with 400/401.
    try {
      const tokenPath = path.join(__dirname, '..', '..', '.env');
      const envContent = fs.readFileSync(tokenPath, 'utf-8');
      for (const rawLine of envContent.split('\n')) {
        const line = rawLine.trim();
        if (!line.startsWith('QUICKBOOKS_REFRESH_TOKEN=')) continue;
        const value = line.slice('QUICKBOOKS_REFRESH_TOKEN='.length).trim();
        if (value && value !== this.refreshToken) {
          this.refreshToken = value;
        }
        return;
      }
    } catch {
      // Best-effort. If .env can't be read, fall through and try with whatever
      // is already in memory; refreshUsingToken will surface the error.
    }
  }

  async refreshAccessToken() {
    // Pick up any refresh_token rotation persisted by a sibling process.
    this.reloadRefreshTokenFromEnv();

    if (!this.refreshToken) {
      await this.startOAuthFlow();

      // Verify we have a refresh token after OAuth flow
      if (!this.refreshToken) {
        throw new Error('Failed to obtain refresh token from OAuth flow');
      }
    }

    try {
      // At this point we know refreshToken is not undefined
      const authResponse = await this.oauthClient.refreshUsingToken(this.refreshToken);

      this.accessToken = authResponse.token.access_token;

      // QuickBooks rotates the refresh_token on refresh (approximately every
      // 24 hours a new value is returned). If the rotated value isn't
      // captured and persisted, the next refresh will fail with
      // "Failed to refresh Quickbooks token: Request failed with status code
      // 400" because the stored refresh_token is now invalid. Capture and
      // persist whenever QBO returns a new value.
      const rotatedRefreshToken = (authResponse.token as { refresh_token?: string }).refresh_token;
      if (rotatedRefreshToken && rotatedRefreshToken !== this.refreshToken) {
        this.refreshToken = rotatedRefreshToken;
        try {
          this.saveTokensToEnv();
        } catch (persistError: any) {
          console.error(
            `[quickbooks-client] failed to persist rotated refresh token: ${persistError?.message ?? persistError}`,
          );
        }
      }

      // Calculate expiry time
      const expiresIn = authResponse.token.expires_in || 3600; // Default to 1 hour
      this.accessTokenExpiry = new Date(Date.now() + expiresIn * 1000);

      return {
        access_token: this.accessToken,
        expires_in: expiresIn,
      };
    } catch (error: any) {
      throw new Error(`Failed to refresh Quickbooks token: ${error.message}`);
    }
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
