/**
 * Behavioral test for the QUICKBOOKS_TOKEN_STORE_PATH override.
 *
 * TOKEN_STORE_PATH is resolved once at module import, so this file sets the env
 * var BEFORE importing the client and asserts the atomic token write targets the
 * override rather than the module-relative default. The default-path behavior is
 * already covered by save-tokens-to-env.test.ts (which sets no override).
 *
 * Mirrors the fs/oauth mocking pattern from save-tokens-to-env.test.ts.
 */
import { jest } from '@jest/globals';

const STORE_PATH = '/writable-volume/qbo-tokens.env';

process.env.QUICKBOOKS_CLIENT_ID = 'test-client-id';
process.env.QUICKBOOKS_CLIENT_SECRET = 'test-client-secret';
process.env.QUICKBOOKS_REFRESH_TOKEN = 'initial-token';
process.env.QUICKBOOKS_REALM_ID = '99999';
process.env.QUICKBOOKS_ENVIRONMENT = 'sandbox';
process.env.QUICKBOOKS_REDIRECT_URI = 'http://localhost:8000/callback';
process.env.QUICKBOOKS_TOKEN_STORE_PATH = STORE_PATH;

const writeFileSyncSpy = jest.fn<(p: string, data: string, options?: any) => void>();
const renameSyncSpy = jest.fn<(o: string, n: string) => void>();

jest.unstable_mockModule('fs', () => ({
  default: {
    existsSync: jest.fn(() => true),
    readFileSync: jest.fn(() => 'QUICKBOOKS_REFRESH_TOKEN=old-token\nQUICKBOOKS_REALM_ID=99999\n'),
    writeFileSync: writeFileSyncSpy,
    renameSync: renameSyncSpy,
    unlinkSync: jest.fn(),
    lstatSync: jest.fn(() => ({ isSymbolicLink: () => false })),
    realpathSync: jest.fn(() => STORE_PATH),
    readlinkSync: jest.fn(() => STORE_PATH),
  },
}));

let tokenCounter = 0;
const refreshDispatch = jest.fn<(token: string) => Promise<unknown>>();

jest.unstable_mockModule('intuit-oauth', () => {
  class MockOAuthClient {
    static scopes = { Accounting: 'com.intuit.quickbooks.accounting' };
    refreshUsingToken = jest.fn((token: string) => refreshDispatch(token));
    createToken = jest.fn();
    authorizeUri = jest.fn(() => 'https://mock');
    constructor(_cfg: Record<string, unknown>) {}
  }
  return { default: MockOAuthClient };
});

jest.unstable_mockModule('node-quickbooks', () => ({
  default: class MockQuickBooks { constructor(..._args: unknown[]) {} },
}));
jest.unstable_mockModule('open', () => ({ default: jest.fn(async () => undefined) }));
jest.unstable_mockModule('http', () => ({
  default: {
    createServer: jest.fn(() => ({
      listen: jest.fn(), close: jest.fn(), on: jest.fn(),
      address: jest.fn(() => ({ port: 8000 })),
    })),
  },
}));

const { quickbooksClient } = await import('../../../src/clients/quickbooks-client');

describe('QUICKBOOKS_TOKEN_STORE_PATH override', () => {
  beforeEach(() => {
    writeFileSyncSpy.mockClear();
    renameSyncSpy.mockClear();
    tokenCounter++;
    refreshDispatch.mockResolvedValue({
      token: {
        access_token: `access-${tokenCounter}`,
        expires_in: 3600,
        refresh_token: `rotated-${tokenCounter}`,
      },
    });
    (quickbooksClient as any).accessTokenExpiry = new Date(0);
    (quickbooksClient as any).authInFlight = undefined;
  });

  it('persists the rotated token to the configured path, not the module default', async () => {
    await quickbooksClient.authenticate();

    expect(renameSyncSpy).toHaveBeenCalled();
    const [tmpPath, destPath] = renameSyncSpy.mock.calls[0];
    expect(destPath).toBe(STORE_PATH);
    expect(String(tmpPath).startsWith(`${STORE_PATH}.tmp.`)).toBe(true);
    // Never the installed-module default.
    expect(String(destPath).endsWith('/dist/.env')).toBe(false);
    expect(writeFileSyncSpy).toHaveBeenCalledWith(
      expect.stringContaining(`${STORE_PATH}.tmp.`),
      expect.stringContaining(`QUICKBOOKS_REFRESH_TOKEN=rotated-${tokenCounter}`),
      expect.objectContaining({ mode: 0o600 }),
    );
  });
});
