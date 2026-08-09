import { jest } from '@jest/globals';

let lstatBehavior: 'regular' | 'symlink' | 'throws' = 'regular';
let realpathBehavior: 'ok' | 'enoent' = 'ok';
let readFileBehavior: 'ok' | 'enoent' | 'corrupt' | 'eacces' = 'ok';
const REAL_PATH = '/persistent-volume/tokens.json';
let readlinkTarget = '/fresh-pvc/tokens.json';

const writeFileSyncSpy = jest.fn<(p: string, data: string, options?: any) => void>();
const renameSyncSpy = jest.fn<(o: string, n: string) => void>();
const mkdirSyncSpy = jest.fn<(p: string, options?: any) => void>();
const unlinkSyncSpy = jest.fn<(p: string) => void>();
let consoleErrorSpy: ReturnType<typeof jest.spyOn>;

jest.unstable_mockModule('fs', () => ({
  default: {
    readFileSync: jest.fn(() => {
      if (readFileBehavior === 'enoent') throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      if (readFileBehavior === 'eacces') throw Object.assign(new Error('EACCES'), { code: 'EACCES' });
      if (readFileBehavior === 'corrupt') return '{ not valid json';
      return JSON.stringify({ refreshToken: 'stored-token', realmId: '99999', descendedFrom: 'host-token', updatedAt: '2026-08-01T00:00:00.000Z' });
    }),
    writeFileSync: writeFileSyncSpy,
    renameSync: renameSyncSpy,
    unlinkSync: unlinkSyncSpy,
    mkdirSync: mkdirSyncSpy,
    lstatSync: jest.fn(() => {
      if (lstatBehavior === 'throws') throw new Error('EACCES');
      return { isSymbolicLink: () => lstatBehavior === 'symlink' };
    }),
    realpathSync: jest.fn(() => {
      if (realpathBehavior === 'enoent') throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      return REAL_PATH;
    }),
    readlinkSync: jest.fn(() => readlinkTarget),
  },
}));

const { loadTokenSidecar, saveTokenSidecar } = await import('../../../src/clients/token-sidecar');

describe('loadTokenSidecar', () => {
  beforeEach(() => {
    readFileBehavior = 'ok';
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('returns null silently when the file does not exist', () => {
    readFileBehavior = 'enoent';
    expect(loadTokenSidecar()).toBeNull();
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it('returns the parsed sidecar when the file is valid JSON', () => {
    expect(loadTokenSidecar()).toEqual({
      refreshToken: 'stored-token', realmId: '99999', descendedFrom: 'host-token', updatedAt: '2026-08-01T00:00:00.000Z',
    });
  });

  it('returns null and logs a warning on corrupt JSON', () => {
    readFileBehavior = 'corrupt';
    expect(loadTokenSidecar()).toBeNull();
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to read token sidecar'));
  });

  it('returns null and logs a warning on a permission error', () => {
    readFileBehavior = 'eacces';
    expect(loadTokenSidecar()).toBeNull();
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to read token sidecar'));
  });
});

describe('saveTokenSidecar', () => {
  const data = { refreshToken: 'new-token', realmId: '99999', descendedFrom: 'host-token', updatedAt: '2026-08-01T00:00:00.000Z' };

  beforeEach(() => {
    writeFileSyncSpy.mockClear();
    renameSyncSpy.mockClear();
    mkdirSyncSpy.mockClear();
    unlinkSyncSpy.mockClear();
    lstatBehavior = 'regular';
    realpathBehavior = 'ok';
    readlinkTarget = '/fresh-pvc/tokens.json';
  });

  afterEach(() => {
    delete process.env.QUICKBOOKS_TOKEN_STORE_PATH;
  });

  it('creates the parent directory before writing', () => {
    saveTokenSidecar(data);
    expect(mkdirSyncSpy).toHaveBeenCalledWith(expect.any(String), { recursive: true });
  });

  it('uses atomic temp+rename for a regular file', () => {
    saveTokenSidecar(data);
    expect(renameSyncSpy).toHaveBeenCalled();
    const [tmpPath, destPath] = renameSyncSpy.mock.calls[0];
    expect(tmpPath).toContain('tokens.json.tmp.');
    expect(destPath).toContain('tokens.json');
    expect(writeFileSyncSpy).toHaveBeenCalledWith(
      expect.stringContaining('tokens.json.tmp.'),
      expect.stringContaining('"refreshToken": "new-token"'),
      expect.objectContaining({ mode: 0o600 }),
    );
  });

  it('writes through a symlink target via realpathSync (no rename)', () => {
    lstatBehavior = 'symlink';
    saveTokenSidecar(data);
    expect(renameSyncSpy).not.toHaveBeenCalled();
    expect(writeFileSyncSpy).toHaveBeenCalledWith(
      REAL_PATH,
      expect.stringContaining('"refreshToken": "new-token"'),
      expect.objectContaining({ mode: 0o600 }),
    );
  });

  it('resolves a dangling symlink via readlinkSync fallback', () => {
    lstatBehavior = 'symlink';
    realpathBehavior = 'enoent';
    readlinkTarget = '/fresh-pvc/tokens.json';
    saveTokenSidecar(data);
    expect(writeFileSyncSpy).toHaveBeenCalledWith(
      '/fresh-pvc/tokens.json',
      expect.any(String),
      expect.objectContaining({ mode: 0o600 }),
    );
  });

  it('resolves a RELATIVE dangling-symlink target against the link directory', () => {
    lstatBehavior = 'symlink';
    realpathBehavior = 'enoent';
    readlinkTarget = '../vol/tokens.json';
    saveTokenSidecar(data);
    expect(renameSyncSpy).not.toHaveBeenCalled();
    const writtenPath = writeFileSyncSpy.mock.calls[0][0] as string;
    expect(writtenPath).not.toBe('../vol/tokens.json');
    expect(writtenPath.startsWith('/')).toBe(true);
    expect(writtenPath.endsWith('/vol/tokens.json')).toBe(true);
  });

  it('cleans up the temp file and re-throws when the write fails', () => {
    const writeErr = new Error('ENOSPC');
    writeFileSyncSpy.mockImplementationOnce(() => {
      throw writeErr;
    });
    expect(() => saveTokenSidecar(data)).toThrow(writeErr);
    expect(unlinkSyncSpy).toHaveBeenCalledWith(expect.stringContaining('tokens.json.tmp.'));
    expect(renameSyncSpy).not.toHaveBeenCalled();
  });

  it('honors QUICKBOOKS_TOKEN_STORE_PATH for both the parent dir and the write target', () => {
    process.env.QUICKBOOKS_TOKEN_STORE_PATH = '/vol/tokens.json';
    saveTokenSidecar(data);
    expect(mkdirSyncSpy).toHaveBeenCalledWith('/vol', { recursive: true });
    expect(renameSyncSpy).toHaveBeenCalledWith(
      expect.stringContaining('/vol/tokens.json.tmp.'),
      '/vol/tokens.json',
    );
  });
});
