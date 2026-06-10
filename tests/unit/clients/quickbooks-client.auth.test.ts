/**
 * Behavioral tests for QuickbooksClient authentication recovery.
 *
 * Covers two failure modes that previously made `npm run auth` (and any MCP
 * call) fail hard with no way to recover except hand-editing .env:
 *
 * 1. authenticate() must fall back to the interactive OAuth flow when the
 *    stored refresh token is rejected (e.g. invalid_grant after the token
 *    was rotated by another consumer, expired past the 100-day window, or
 *    was revoked).
 * 2. The interactive flow must authorize AND exchange with the localhost
 *    callback redirect, even when QUICKBOOKS_REDIRECT_URI points elsewhere
 *    (e.g. the OAuth playground). Intuit rejects the code exchange if the
 *    redirect_uri differs from the one used in the authorize request.
 */
import { jest } from '@jest/globals';

// The module under test validates env at import time. Set deterministic
// values before importing it. QUICKBOOKS_REDIRECT_URI deliberately points
// away from localhost to prove the flow ignores it.
process.env.QUICKBOOKS_CLIENT_ID = 'test-client-id';
process.env.QUICKBOOKS_CLIENT_SECRET = 'test-client-secret';
process.env.QUICKBOOKS_REFRESH_TOKEN = 'stale-refresh-token';
process.env.QUICKBOOKS_REALM_ID = '12345';
process.env.QUICKBOOKS_ENVIRONMENT = 'sandbox';
process.env.QUICKBOOKS_REDIRECT_URI = 'https://developer.intuit.com/v2/OAuth2Playground/RedirectUrl';

// Track every OAuthClient the module constructs so tests can tell the
// module-level client (env redirect) apart from the flow client (localhost).
type MockOAuth = {
  cfg: Record<string, unknown>;
  refreshUsingToken: jest.Mock;
  createToken: jest.Mock;
  authorizeUri: jest.Mock;
};
const oauthInstances: MockOAuth[] = [];
// Shared dispatch points so tests can program responses without caring which
// instance receives the call.
const refreshDispatch = jest.fn<(token: string) => Promise<unknown>>();
const createTokenDispatch = jest.fn<(url: string) => Promise<unknown>>();

jest.unstable_mockModule('intuit-oauth', () => {
  class MockOAuthClient {
    static scopes = { Accounting: 'com.intuit.quickbooks.accounting' };
    cfg: Record<string, unknown>;
    refreshUsingToken = jest.fn((token: string) => refreshDispatch(token));
    createToken = jest.fn((url: string) => createTokenDispatch(url));
    authorizeUri = jest.fn(() => 'https://appcenter.intuit.com/connect/oauth2?mock');
    constructor(cfg: Record<string, unknown>) {
      this.cfg = cfg;
      oauthInstances.push(this as unknown as MockOAuth);
    }
  }
  return { default: MockOAuthClient };
});

jest.unstable_mockModule('node-quickbooks', () => ({
  default: class MockQuickBooks {
    constructor(..._args: unknown[]) {}
  },
}));

jest.unstable_mockModule('open', () => ({ default: jest.fn(async () => undefined) }));

// Capture the OAuth callback handler instead of binding a real port, and
// stub fs so the test never touches a real .env file (dotenv reads it at
// import; saveTokensToEnv writes it after the flow).
let callbackHandler:
  | ((req: { url?: string; method?: string }, res: { writeHead: jest.Mock; end: jest.Mock }) => Promise<void>)
  | undefined;
const fakeServer = {
  listen: jest.fn((_port: unknown, _host: unknown, cb?: () => void) => {
    if (cb) setImmediate(cb);
    return fakeServer;
  }),
  close: jest.fn(),
  on: jest.fn(),
  address: jest.fn(() => ({ address: '::', port: 8000, family: 'IPv6' })),
};
jest.unstable_mockModule('http', () => ({
  default: {
    createServer: jest.fn((handler: typeof callbackHandler) => {
      callbackHandler = handler;
      return fakeServer;
    }),
  },
}));

const enoent = () => Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
jest.unstable_mockModule('fs', () => ({
  default: {
    readFileSync: jest.fn(() => {
      throw enoent();
    }),
    existsSync: jest.fn(() => false),
    writeFileSync: jest.fn(),
    renameSync: jest.fn(),
    unlinkSync: jest.fn(),
  },
}));

const { quickbooksClient } = await import('../../../src/clients/quickbooks-client');

// Polls until the OAuth callback handler has been registered by startOAuthFlow.
async function untilCallbackRegistered(timeoutMs = 2000): Promise<void> {
  const start = Date.now();
  while (!callbackHandler) {
    if (Date.now() - start > timeoutMs) throw new Error('OAuth callback handler never registered');
    await new Promise((resolve) => setImmediate(resolve));
  }
}

describe('QuickbooksClient.authenticate', () => {
  it('refreshes silently without starting the interactive flow when the refresh token works', async () => {
    refreshDispatch.mockResolvedValueOnce({
      token: { access_token: 'access-1', expires_in: 3600, refresh_token: 'rotated-1' },
    });

    await quickbooksClient.authenticate();

    // Only the module-level client exists; no flow client was constructed.
    expect(oauthInstances).toHaveLength(1);
    expect(oauthInstances[0].cfg.redirectUri).toBe(process.env.QUICKBOOKS_REDIRECT_URI);
    expect(callbackHandler).toBeUndefined();
  });

  it('falls back to the interactive OAuth flow when the refresh token is rejected, and uses the localhost redirect', async () => {
    // Force the next authenticate() to attempt a refresh.
    (quickbooksClient as unknown as { accessTokenExpiry?: Date }).accessTokenExpiry = new Date(0);

    refreshDispatch
      // The stored token is dead.
      .mockRejectedValueOnce(new Error('invalid_grant'))
      // After the interactive flow hands us a new one, refresh succeeds.
      .mockResolvedValueOnce({
        token: { access_token: 'access-2', expires_in: 3600, refresh_token: 'rotated-2' },
      });
    createTokenDispatch.mockResolvedValueOnce({
      token: { refresh_token: 'flow-refresh-token', realmId: '12345' },
    });

    const authPromise = quickbooksClient.authenticate();

    // Simulate the user completing authorization in the browser: Intuit
    // redirects to the local callback server.
    await untilCallbackRegistered();
    const res = { writeHead: jest.fn(), end: jest.fn() };
    await callbackHandler!({ url: '/callback?code=abc&state=testState', method: 'GET' }, res);

    await authPromise;

    // A second OAuthClient was constructed for the flow, with the localhost
    // redirect (NOT the playground URI from the environment).
    expect(oauthInstances).toHaveLength(2);
    const flowClient = oauthInstances[1];
    expect(flowClient.cfg.redirectUri).toBe('http://localhost:8000/callback');

    // The code exchange went through the flow client, so authorize and
    // exchange used the same redirect_uri.
    expect(flowClient.createToken).toHaveBeenCalledWith('/callback?code=abc&state=testState');
    expect(oauthInstances[0].createToken).not.toHaveBeenCalled();

    // The flow's new refresh token was then exchanged for an access token.
    expect(refreshDispatch).toHaveBeenLastCalledWith('flow-refresh-token');
    expect(res.writeHead).toHaveBeenCalledWith(200, { 'Content-Type': 'text/html' });
  }, 15000);
});
