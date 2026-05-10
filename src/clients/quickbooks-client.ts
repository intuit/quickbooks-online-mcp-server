import QuickBooks from "node-quickbooks";
import OAuthClient from "intuit-oauth";
import http from 'http';
import fs from 'fs';
import path from 'path';
import open from 'open';
import { bootstrapQuickBooksEnv } from "./env-bootstrap.js";
import { persistQuickBooksRefreshTokenToWarehouse } from "./warehouse-token-sync.js";

const qb = bootstrapQuickBooksEnv();
const client_id = qb.clientId;
const client_secret = qb.clientSecret;
const refresh_token = qb.refreshToken;
const realm_id = qb.realmId;
const environment = qb.environment;
const redirect_uri = qb.redirectUri;
const env_file_path = qb.envFilePath;

type QuickBooksTokenPayload = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  realmId?: string;
};

type OAuthCallbackConfig = {
  origin: string;
  path: string;
  port: number;
};

function quickBooksTokenPayload(response: any): QuickBooksTokenPayload {
  const token = response?.token;
  if (typeof token?.getToken === 'function') {
    return token.getToken();
  }
  if (typeof response?.getToken === 'function') {
    return response.getToken();
  }
  return token ?? response ?? {};
}

function oauthCallbackConfig(redirectUri: string): OAuthCallbackConfig {
  const callbackUrl = new URL(redirectUri);
  const hostname = callbackUrl.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  const localHostnames = new Set(['localhost', '127.0.0.1', '::1']);

  if (callbackUrl.protocol !== 'http:' || !localHostnames.has(hostname)) {
    throw new Error(
      'QUICKBOOKS_REDIRECTURI must be an http://localhost callback URL for the local OAuth flow',
    );
  }

  const port = Number(callbackUrl.port || '80');
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`QUICKBOOKS_REDIRECTURI has an invalid callback port: ${redirectUri}`);
  }

  return {
    origin: `${callbackUrl.protocol}//${callbackUrl.host}`,
    path: callbackUrl.pathname || '/',
    port,
  };
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

    const callback = oauthCallbackConfig(this.redirectUri);
    this.isAuthenticating = true;

    return new Promise((resolve, reject) => {
      // Create temporary server for OAuth callback
      const server = http.createServer(async (req, res) => {
        const requestUrl = new URL(req.url ?? '/', callback.origin);
        if (requestUrl.pathname !== callback.path) {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('Not found');
          return;
        }

        try {
          const response = await this.oauthClient.createToken(requestUrl.toString());
          const tokens = quickBooksTokenPayload(response);
          if (!tokens.refresh_token) {
            throw new Error('QuickBooks OAuth response omitted refresh_token');
          }
          
          // Save tokens
          this.refreshToken = tokens.refresh_token;
          this.realmId = tokens.realmId;
          await this.persistTokensAfterQuickBooksAuth();
          
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
      });

      // Start server
      server.listen(callback.port, async () => {
        
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
    const tokenPath = env_file_path;
    fs.mkdirSync(path.dirname(tokenPath), { recursive: true });
    const envContent = fs.existsSync(tokenPath) ? fs.readFileSync(tokenPath, 'utf-8') : '';
    const envLines = envContent ? envContent.replace(/\n$/, '').split('\n') : [];
    
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

    fs.writeFileSync(tokenPath, envLines.join('\n').replace(/\n*$/, '\n'));
  }

  private async persistTokensAfterQuickBooksAuth(): Promise<void> {
    this.saveTokensToEnv();
    await this.persistRefreshTokenToWarehouse();
  }

  private async persistRefreshTokenToWarehouse(): Promise<void> {
    if (!this.refreshToken) return;

    try {
      const result = await persistQuickBooksRefreshTokenToWarehouse(this.refreshToken);
      if (result.synced) {
        console.warn(`[QuickBooks MCP] Refresh token synced to Warehouse secrets for ${result.warehouseId}`);
      } else {
        console.warn(`[QuickBooks MCP] Warehouse refresh token sync skipped: ${result.skippedReason}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[QuickBooks MCP] Warehouse refresh token sync failed; continuing: ${message}`);
    }
  }

  async refreshAccessToken() {
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
      const tokens = quickBooksTokenPayload(authResponse);

      if (!tokens.access_token) {
        throw new Error('QuickBooks refresh response omitted access_token');
      }
      if (!tokens.refresh_token) {
        throw new Error('QuickBooks refresh response omitted refresh_token');
      }

      this.accessToken = tokens.access_token;

      // QuickBooks uses rolling refresh tokens. Push every successful refresh
      // through Warehouse too, so cloud secrets heal even if Intuit returns the
      // same refresh token value this time.
      const nextRefreshToken = tokens.refresh_token;
      const refreshTokenChanged = Boolean(nextRefreshToken && nextRefreshToken !== this.refreshToken);
      if (nextRefreshToken) {
        this.refreshToken = nextRefreshToken;
      }
      if (refreshTokenChanged) {
        this.saveTokensToEnv();
      }
      await this.persistRefreshTokenToWarehouse();
      
      // Calculate expiry time
      const expiresIn = tokens.expires_in || 3600; // Default to 1 hour
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
