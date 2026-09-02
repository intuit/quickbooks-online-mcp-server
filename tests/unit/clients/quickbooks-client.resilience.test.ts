/**
 * Resilience tests for QuickbooksClient token handling.
 *
 * Covers two failure modes behind a production outage:
 *
 * 1. Multi-process refresh-token rotation race. A host may spawn this server
 *    more than once against the same .env (Claude Desktop + Claude Code), and
 *    Intuit invalidates the previous refresh token on every rotation. The
 *    client refreshes with its in-memory token first and only consults .env
 *    AFTER that token is rejected, retrying once with a sibling's freshly
 *    persisted token — so a valid in-memory token (including one just rotated
 *    but not yet persisted) is never discarded.
 * 2. In production, a genuinely dead refresh token fails with an actionable
 *    "re-authorize" error rather than opening the interactive localhost OAuth
 *    flow (Intuit rejects localhost redirects for production apps). A TRANSIENT
 *    failure (5xx/429/network) must instead stay retryable and self-heal.
 */
import { jest } from '@jest/globals';

process.env.QUICKBOOKS_CLIENT_ID = 'test-client-id';
process.env.QUICKBOOKS_CLIENT_SECRET = 'test-client-secret';
process.env.QUICKBOOKS_REFRESH_TOKEN = 'seed-refresh-token';
process.env.QUICKBOOKS_REALM_ID = '12345';
process.env.QUICKBOOKS_ENVIRONMENT = 'sandbox';
process.env.QUICKBOOKS_REDIRECT_URI = 'https://developer.intuit.com/v2/OAuth2Playground/RedirectUrl';

// No-op dotenv config so the real .env is never read (see auth test), plus a
// realistic parse() that mirrors dotenv's quote/inline-comment/export handling
// so readPersistedRefreshToken() is exercised against true dotenv semantics.
jest.unstable_mockModule('dotenv', () => ({
  default: {
    config: jest.fn(),
    parse: (src: Buffer | string) => {
      const out: Record<string, string> = {};
      for (const line of String(src).split(/\r?\n/)) {
        const m = line.match(/^\s*(?:export\s+)?([\w.-]+)\s*=\s*(.*)$/);
        if (!m) continue;
        let v = (m[2] ?? '').trim();
        // A quoted value at the start wins; trailing content (e.g. a comment
        // after the closing quote) is ignored — matching dotenv.
        const quoted = v.match(/^(['"`])((?:\\.|[^\\])*?)\1/);
        if (quoted) v = quoted[2];
        else v = v.split(' #')[0].trim(); // strip inline comment (unquoted only)
        out[m[1]] = v;
      }
      return out;
    },
  },
}));

const refreshDispatch = jest.fn<(token: string) => Promise<unknown>>();
const openMock = jest.fn(async () => undefined);

jest.unstable_mockModule('intuit-oauth', () => {
  class MockOAuthClient {
    static scopes = { Accounting: 'com.intuit.quickbooks.accounting' };
    cfg: Record<string, unknown>;
    refreshUsingToken = jest.fn((token: string) => refreshDispatch(token));
    createToken = jest.fn();
    authorizeUri = jest.fn(() => 'https://appcenter.intuit.com/connect/oauth2?mock');
    constructor(cfg: Record<string, unknown>) {
      this.cfg = cfg;
    }
  }
  return { default: MockOAuthClient };
});

jest.unstable_mockModule('node-quickbooks', () => ({
  default: class MockQuickBooks {
    constructor(..._args: unknown[]) {}
  },
}));

jest.unstable_mockModule('open', () => ({ default: openMock }));

// http.createServer must never be reached in these tests (production throws
// before it; the rotation tests never fall back). If it is, serverCreated flips
// so we can assert "no doomed browser flow was started".
let serverCreated = false;
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
    createServer: jest.fn(() => {
      serverCreated = true;
      return fakeServer;
    }),
  },
}));

// Controllable fs mock: readFileSync drives readPersistedRefreshToken().
const fsReadFileSync = jest.fn<(...args: unknown[]) => string>();
jest.unstable_mockModule('fs', () => ({
  default: {
    readFileSync: fsReadFileSync,
    existsSync: jest.fn(() => false),
    writeFileSync: jest.fn(),
    renameSync: jest.fn(),
    unlinkSync: jest.fn(),
  },
}));

const { QuickbooksClient } = await import('../../../src/clients/quickbooks-client');

function makeClient(overrides: Partial<{ environment: string; refreshToken: string }> = {}) {
  return new QuickbooksClient({
    clientId: 'test-client-id',
    clientSecret: 'test-client-secret',
    refreshToken: overrides.refreshToken ?? 'in-memory-token',
    realmId: '12345',
    environment: overrides.environment ?? 'sandbox',
    redirectUri: 'https://developer.intuit.com/v2/OAuth2Playground/RedirectUrl',
  });
}
const tokenOf = (client: unknown) => (client as { refreshToken?: string }).refreshToken;
const envWithToken = (t: string) => `QUICKBOOKS_CLIENT_ID=x\nQUICKBOOKS_REFRESH_TOKEN=${t}\nQUICKBOOKS_REALM_ID=12345\n`;

// Error fixtures mirroring intuit-oauth 4.2.1's REAL shapes, captured
// empirically against the live library:
//  - a rejected refresh token surfaces ONLY as the axios message
//    "Request failed with status code 400"; error_description is "",
//    authResponse.response is "", authResponse.status is a function -> undefined.
//  - transient failures carry a 5xx/429 status code or a network error message.
const deadTokenError = (code = 400) =>
  Object.assign(new Error(`Request failed with status code ${code}`), {
    error: `Request failed with status code ${code}`,
    error_description: '',
    intuit_tid: 'tid-abc',
    authResponse: { token: {}, response: '', body: '', json: null, status: () => undefined, intuit_tid: 'tid-abc' },
  });
const transientError = (code?: number) =>
  code === undefined
    ? new Error('getaddrinfo ETIMEDOUT oauth.platform.intuit.com')
    : Object.assign(new Error(`Request failed with status code ${code}`), {
        error: `Request failed with status code ${code}`,
        authResponse: { response: '', status: () => undefined },
      });

async function messageOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return '';
  } catch (e) {
    return (e as Error).message;
  }
}

beforeEach(() => {
  refreshDispatch.mockReset();
  fsReadFileSync.mockReset();
  openMock.mockClear();
  serverCreated = false;
  fsReadFileSync.mockImplementation(() => {
    throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
  });
});

describe('multi-process rotation race', () => {
  it('does not consult .env when the in-memory token is valid (never discards a good token)', async () => {
    // Regression guard: disk holds a STALE token (a prior persist failed), but
    // the in-memory token is valid. The refresh must use memory and not touch
    // disk — the pre-review bug adopted disk unconditionally and locked out a
    // company whose valid token was in memory.
    const client = makeClient({ refreshToken: 'valid-in-memory-T2' });
    fsReadFileSync.mockReturnValue(envWithToken('stale-disk-T1'));
    refreshDispatch.mockResolvedValueOnce({ token: { access_token: 'a1', expires_in: 3600 } });

    await client.refreshAccessToken();

    expect(refreshDispatch).toHaveBeenCalledTimes(1);
    expect(refreshDispatch).toHaveBeenCalledWith('valid-in-memory-T2');
    expect(fsReadFileSync).not.toHaveBeenCalled(); // disk only consulted on failure
  });

  it('retries with a sibling-rotated disk token after the in-memory token is REJECTED', async () => {
    const client = makeClient({ refreshToken: 'stale-A' });
    fsReadFileSync.mockReturnValue(envWithToken('fresh-B')); // sibling rotated & persisted
    refreshDispatch
      .mockRejectedValueOnce(deadTokenError(400)) // stale-A rejected (real shape)
      .mockResolvedValueOnce({ token: { access_token: 'a2', expires_in: 3600 } }); // fresh-B works

    await client.refreshAccessToken();

    expect(refreshDispatch.mock.calls).toEqual([['stale-A'], ['fresh-B']]);
  });

  it('does NOT swap the in-memory token on a TRANSIENT first error (never discards a valid token)', async () => {
    // Regression guard for the second-pass blocker: a transient blip must not
    // cause a disk re-read that could replace a valid (rotated-but-unpersisted)
    // in-memory token with a stale disk one.
    const client = makeClient({ refreshToken: 'valid-T3' });
    fsReadFileSync.mockReturnValue(envWithToken('stale-disk-T2'));
    refreshDispatch.mockRejectedValueOnce(transientError(503));

    await expect(client.refreshAccessToken()).rejects.toThrow(/Failed to refresh Quickbooks token/);
    expect(refreshDispatch).toHaveBeenCalledTimes(1); // no retry
    expect(fsReadFileSync).not.toHaveBeenCalled(); // disk never consulted on a transient error
    expect(tokenOf(client)).toBe('valid-T3'); // token preserved
  });

  it('parses a quoted disk token like dotenv when falling back', async () => {
    const client = makeClient({ refreshToken: 'dead-A' });
    fsReadFileSync.mockReturnValue('QUICKBOOKS_REFRESH_TOKEN="fresh-B" # rotated\n'); // quoted + comment
    refreshDispatch
      .mockRejectedValueOnce(deadTokenError(400))
      .mockResolvedValueOnce({ token: { access_token: 'a', expires_in: 3600 } });

    await client.refreshAccessToken();

    // Quotes and inline comment stripped: retry uses fresh-B, not '"fresh-B"...'.
    expect(refreshDispatch).toHaveBeenLastCalledWith('fresh-B');
  });

  it('gives up when the disk token is unchanged after a rejection (token genuinely dead)', async () => {
    const client = makeClient({ refreshToken: 'dead-token' });
    fsReadFileSync.mockReturnValue(envWithToken('dead-token')); // no sibling rotation
    refreshDispatch.mockRejectedValue(deadTokenError(400));

    await expect(client.refreshAccessToken()).rejects.toThrow(/Failed to refresh Quickbooks token/);
    expect(refreshDispatch).toHaveBeenCalledTimes(1); // no pointless retry with the same token
  });
});

describe('production dead-token handling', () => {
  it('throws an actionable error and never opens a browser on a real HTTP-400 dead token', async () => {
    const client = makeClient({ environment: 'production', refreshToken: 'dead-prod' });
    fsReadFileSync.mockReturnValue(envWithToken('dead-prod'));
    refreshDispatch.mockRejectedValue(deadTokenError(400)); // real intuit-oauth shape

    await expect(client.authenticate()).rejects.toThrow(/cannot be renewed automatically in production/);
    expect(serverCreated).toBe(false);
    expect(openMock).not.toHaveBeenCalled();
  });

  it('treats a 401 as a dead token', async () => {
    const client = makeClient({ environment: 'production', refreshToken: 'revoked' });
    fsReadFileSync.mockReturnValue(envWithToken('revoked'));
    refreshDispatch.mockRejectedValue(deadTokenError(401));

    await expect(client.authenticate()).rejects.toThrow(/cannot be renewed automatically in production/);
  });

  it('treats an explicit invalid_grant error_description as a dead token', async () => {
    const client = makeClient({ environment: 'production', refreshToken: 'dead2' });
    fsReadFileSync.mockReturnValue(envWithToken('dead2'));
    refreshDispatch.mockRejectedValue(
      Object.assign(new Error('Request failed with status code 400'), {
        error: 'invalid_grant',
        error_description: 'Token invalid or expired',
      })
    );

    await expect(client.authenticate()).rejects.toThrow(/cannot be renewed automatically in production/);
  });

  it('throws the same actionable error when a production server starts with no refresh token', async () => {
    const client = makeClient({ environment: 'production', refreshToken: '' });
    (client as unknown as { refreshToken?: string }).refreshToken = undefined;

    await expect(client.authenticate()).rejects.toThrow(/cannot be renewed automatically in production/);
    expect(serverCreated).toBe(false);
    expect(openMock).not.toHaveBeenCalled();
  });

  it('does NOT report reauth for a transient error in production, and preserves the token', async () => {
    const client = makeClient({ environment: 'production', refreshToken: 'good-but-blip' });
    fsReadFileSync.mockReturnValue(envWithToken('good-but-blip'));
    refreshDispatch.mockRejectedValue(new Error('getaddrinfo ETIMEDOUT api.intuit.com'));

    const msg = await messageOf(client.authenticate());
    expect(msg).toMatch(/Failed to refresh Quickbooks token/);
    expect(msg).not.toMatch(/re-authorize|renewed automatically in production/);
    // In-memory token is NOT cleared, so the next call self-heals.
    expect(tokenOf(client)).toBe('good-but-blip');
    expect(openMock).not.toHaveBeenCalled();
  });

  it('treats a 503 as transient, not a dead token', async () => {
    const client = makeClient({ environment: 'production', refreshToken: 'fine' });
    fsReadFileSync.mockReturnValue(envWithToken('fine'));
    refreshDispatch.mockRejectedValue(transientError(503));

    const msg = await messageOf(client.authenticate());
    expect(msg).not.toMatch(/renewed automatically in production/);
    expect(tokenOf(client)).toBe('fine');
  });

  it('treats a 429 rate-limit as transient, not a dead token', async () => {
    const client = makeClient({ environment: 'production', refreshToken: 'fine429' });
    fsReadFileSync.mockReturnValue(envWithToken('fine429'));
    refreshDispatch.mockRejectedValue(transientError(429));

    const msg = await messageOf(client.authenticate());
    expect(msg).not.toMatch(/renewed automatically in production/);
    expect(tokenOf(client)).toBe('fine429');
  });

  it('still succeeds in production when the refresh token is valid', async () => {
    const client = makeClient({ environment: 'production', refreshToken: 'good-prod-token' });
    fsReadFileSync.mockReturnValue(envWithToken('good-prod-token'));
    refreshDispatch.mockResolvedValueOnce({ token: { access_token: 'a3', expires_in: 3600 } });

    await expect(client.authenticate()).resolves.toBeDefined();
    expect(serverCreated).toBe(false);
    expect(openMock).not.toHaveBeenCalled();
  });

  it('classifies a dead token carried deep in the error cause chain', async () => {
    const client = makeClient({ environment: 'production', refreshToken: 'dead-deep' });
    fsReadFileSync.mockReturnValue(envWithToken('dead-deep'));
    // Real signal is two cause-levels down under generic wrappers.
    const outer = Object.assign(new Error('transport wrapper'), {
      cause: Object.assign(new Error('adapter wrapper'), { cause: deadTokenError(400) }),
    });
    refreshDispatch.mockRejectedValue(outer);

    await expect(client.authenticate()).rejects.toThrow(/cannot be renewed automatically in production/);
  });
});

describe('sandbox transient handling', () => {
  it('does NOT launch interactive OAuth on a transient error in sandbox (preserves token)', async () => {
    const client = makeClient({ environment: 'sandbox', refreshToken: 'valid-sbx' });
    fsReadFileSync.mockReturnValue(envWithToken('valid-sbx'));
    refreshDispatch.mockRejectedValue(transientError(503));

    const msg = await messageOf(client.authenticate());
    expect(msg).toMatch(/Failed to refresh Quickbooks token/);
    expect(serverCreated).toBe(false); // no doomed/​spurious browser flow
    expect(openMock).not.toHaveBeenCalled();
    expect(tokenOf(client)).toBe('valid-sbx'); // token NOT discarded
  });

  it('DOES fall back to interactive OAuth on a genuine dead token in sandbox', async () => {
    const client = makeClient({ environment: 'sandbox', refreshToken: 'dead-sbx' });
    fsReadFileSync.mockReturnValue(envWithToken('dead-sbx'));
    refreshDispatch.mockRejectedValue(deadTokenError(400));

    // The localhost callback never completes in this harness, so the flow hangs;
    // asserting the server was created proves the dead-token path was taken.
    const authPromise = client.authenticate();
    const started = await Promise.race([
      (async () => {
        for (let i = 0; i < 50 && !serverCreated; i++) await new Promise((r) => setImmediate(r));
        return serverCreated;
      })(),
      authPromise.then(() => true).catch(() => true),
    ]);
    expect(started).toBe(true);
    expect(serverCreated).toBe(true);
  });
});
