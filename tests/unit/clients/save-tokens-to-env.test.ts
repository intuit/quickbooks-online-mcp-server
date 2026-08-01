/**
 * Behavioral tests for saveTokensToEnv symlink handling.
 *
 * Exercises the real QuickbooksClient.saveTokensToEnv logic via the public
 * authenticate() → refreshAccessToken() path, using jest.unstable_mockModule
 * to control fs behavior. Mirrors the pattern from quickbooks-client.auth.test.ts.
 *
 * Covers:
 * 1. Regular file: atomic temp+rename path (existing behavior).
 * 2. Symlinked .env: writes through to realpathSync target, no rename.
 * 3. Dangling symlink: readlinkSync fallback when target doesn't exist.
 * 4. isSymbolicLink: fails closed (returns false) on any fs error.
 */
import { jest } from '@jest/globals';
import os from 'os';
import nodePath from 'path';

process.env.QUICKBOOKS_CLIENT_ID = 'test-client-id';
process.env.QUICKBOOKS_CLIENT_SECRET = 'test-client-secret';
process.env.QUICKBOOKS_REFRESH_TOKEN = 'initial-token';
process.env.QUICKBOOKS_REALM_ID = '99999';
process.env.QUICKBOOKS_ENVIRONMENT = 'sandbox';
process.env.QUICKBOOKS_REDIRECT_URI = 'http://localhost:8000/callback';
// Keep the rotated-token store out of the developer's real home directory.
process.env.QUICKBOOKS_TOKEN_STORE = nodePath.join(os.tmpdir(), 'qbo-symlink-test-tokens.json');

// --- fs mock state (mutated by each test) ---
let lstatBehavior: 'regular' | 'symlink' | 'throws' = 'regular';
let realpathBehavior: 'ok' | 'enoent' | 'eacces' = 'ok';
const REAL_PATH = '/persistent-volume/.env';
const LINK_TARGET = '/fresh-pvc/.env';
// Configurable readlinkSync return so tests can exercise absolute vs relative targets.
let readlinkTarget: string = LINK_TARGET;

const writeFileSyncSpy = jest.fn<(p: string, data: string, options?: any) => void>();
const renameSyncSpy = jest.fn<(o: string, n: string) => void>();
const unlinkSyncSpy = jest.fn<(p: string) => void>();

jest.unstable_mockModule('fs', () => ({
  default: {
    existsSync: jest.fn(() => true),
    readFileSync: jest.fn(() => 'QUICKBOOKS_REFRESH_TOKEN=old-token\nQUICKBOOKS_REALM_ID=99999\n'),
    writeFileSync: writeFileSyncSpy,
    renameSync: renameSyncSpy,
    unlinkSync: unlinkSyncSpy,
    lstatSync: jest.fn(() => {
      if (lstatBehavior === 'throws') throw new Error('EACCES');
      return { isSymbolicLink: () => lstatBehavior === 'symlink' };
    }),
    realpathSync: jest.fn(() => {
      if (realpathBehavior === 'enoent') throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      if (realpathBehavior === 'eacces') throw Object.assign(new Error('EACCES'), { code: 'EACCES' });
      return REAL_PATH;
    }),
    readlinkSync: jest.fn(() => readlinkTarget),
  },
}));

// Each test needs a unique refresh token so saveTokensToEnv is triggered
// (it only runs when newRefreshToken !== this.refreshToken).
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
      listen: jest.fn(),
      close: jest.fn(),
      on: jest.fn(),
      address: jest.fn(() => ({ port: 8000 })),
    })),
  },
}));

const { quickbooksClient } = await import('../../../src/clients/quickbooks-client');

describe('saveTokensToEnv (via authenticate)', () => {
  beforeEach(() => {
    writeFileSyncSpy.mockClear();
    renameSyncSpy.mockClear();
    unlinkSyncSpy.mockClear();
    lstatBehavior = 'regular';
    realpathBehavior = 'ok';
    readlinkTarget = LINK_TARGET;
    tokenCounter++;
    refreshDispatch.mockResolvedValue({
      token: {
        access_token: `access-${tokenCounter}`,
        expires_in: 3600,
        refresh_token: `rotated-${tokenCounter}`,
      },
    });
    // Force token expiry so authenticate() triggers refreshAccessToken()
    // which calls saveTokensToEnv() when the refresh token rotates.
    (quickbooksClient as any).accessTokenExpiry = new Date(0);
    (quickbooksClient as any).authInFlight = undefined;
  });

  it('uses atomic temp+rename for regular files (not symlinks)', async () => {
    lstatBehavior = 'regular';

    await quickbooksClient.authenticate();

    expect(renameSyncSpy).toHaveBeenCalled();
    const [tmpPath, destPath] = renameSyncSpy.mock.calls[0];
    expect(tmpPath).toContain('.env.tmp.');
    expect(destPath).toContain('.env');
    expect(writeFileSyncSpy).toHaveBeenCalled();
  });

  it('writes through symlink target via realpathSync (no rename)', async () => {
    lstatBehavior = 'symlink';
    realpathBehavior = 'ok';

    await quickbooksClient.authenticate();

    expect(renameSyncSpy).not.toHaveBeenCalled();
    expect(writeFileSyncSpy).toHaveBeenCalledWith(
      REAL_PATH,
      expect.stringContaining(`QUICKBOOKS_REFRESH_TOKEN=rotated-${tokenCounter}`),
      expect.objectContaining({ mode: 0o600 }),
    );
  });

  it('handles dangling symlink with an ABSOLUTE target via readlinkSync fallback', async () => {
    lstatBehavior = 'symlink';
    realpathBehavior = 'enoent';
    readlinkTarget = LINK_TARGET; // absolute — used as-is

    await quickbooksClient.authenticate();

    expect(renameSyncSpy).not.toHaveBeenCalled();
    expect(writeFileSyncSpy).toHaveBeenCalledWith(
      LINK_TARGET,
      expect.stringContaining(`QUICKBOOKS_REFRESH_TOKEN=rotated-${tokenCounter}`),
      expect.objectContaining({ mode: 0o600 }),
    );
  });

  it('resolves a RELATIVE dangling-symlink target against the link directory', async () => {
    lstatBehavior = 'symlink';
    realpathBehavior = 'enoent';
    // readlinkSync returns a relative target (as stored). It must be resolved
    // against the symlink's own directory, NOT the process cwd.
    readlinkTarget = '../data/.env';

    await quickbooksClient.authenticate();

    expect(renameSyncSpy).not.toHaveBeenCalled();
    // tokenPath is <install>/.env; dirname is <install>; ../data/.env resolves to
    // <install>/../data/.env. Assert the written path ends with the resolved suffix
    // and is absolute (not the bare relative string, and not cwd-relative).
    const writtenPath = writeFileSyncSpy.mock.calls[writeFileSyncSpy.mock.calls.length - 1][0] as string;
    expect(writtenPath).not.toBe('../data/.env'); // not written verbatim
    expect(writtenPath.startsWith('/')).toBe(true); // absolute
    expect(writtenPath.endsWith('/data/.env')).toBe(true); // resolved to link dir's sibling
  });

  it('falls back to atomic rename when lstatSync throws (isSymbolicLink fails closed)', async () => {
    lstatBehavior = 'throws';

    await quickbooksClient.authenticate();

    // isSymbolicLink returns false on error → uses the rename path
    expect(renameSyncSpy).toHaveBeenCalled();
  });

  it('swallows saveTokensToEnv errors without failing authenticate (non-ENOENT realpathSync)', async () => {
    lstatBehavior = 'symlink';
    realpathBehavior = 'eacces';

    // authenticate() catches saveTokensToEnv errors (line 336-338 in source)
    // and logs them; it should NOT throw.
    await expect(quickbooksClient.authenticate()).resolves.not.toThrow();
  });
});
