import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  readTokenStore,
  resolveTokenStorePath,
  selectRefreshToken,
  writeTokenStore,
  StoredTokens,
} from '../../../src/helpers/token-store';

const makeTokens = (overrides: Partial<StoredTokens> = {}): StoredTokens => ({
  refresh_token: 'RT-rotated',
  realm_id: '1234567890',
  seed_refresh_token: 'RT-seed',
  updated_at: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

describe('resolveTokenStorePath', () => {
  it('should honour the QUICKBOOKS_TOKEN_STORE override', () => {
    expect(resolveTokenStorePath({ QUICKBOOKS_TOKEN_STORE: '/tmp/custom.json' })).toBe(
      '/tmp/custom.json'
    );
  });

  it('should default to a location outside the package directory', () => {
    const resolved = resolveTokenStorePath({});
    expect(resolved).toBe(path.join(os.homedir(), '.config', 'qbo-mcp', 'tokens.json'));
  });

  it('should read the ambient environment when none is supplied', () => {
    const previous = process.env.QUICKBOOKS_TOKEN_STORE;
    process.env.QUICKBOOKS_TOKEN_STORE = '/tmp/ambient.json';
    try {
      expect(resolveTokenStorePath()).toBe('/tmp/ambient.json');
    } finally {
      if (previous === undefined) {
        delete process.env.QUICKBOOKS_TOKEN_STORE;
      } else {
        process.env.QUICKBOOKS_TOKEN_STORE = previous;
      }
    }
  });
});

describe('selectRefreshToken', () => {
  it('should prefer a stored token that descends from the configured seed', () => {
    const stored = makeTokens({ refresh_token: 'RT-rotated', seed_refresh_token: 'RT-seed' });
    expect(selectRefreshToken('RT-seed', stored)).toBe('RT-rotated');
  });

  it('should prefer the environment when it has been re-seeded by hand', () => {
    const stored = makeTokens({ refresh_token: 'RT-stale', seed_refresh_token: 'RT-old-seed' });
    expect(selectRefreshToken('RT-freshly-pasted', stored)).toBe('RT-freshly-pasted');
  });

  it('should fall back to the seed when no store exists', () => {
    expect(selectRefreshToken('RT-seed', undefined)).toBe('RT-seed');
  });

  it('should track rotations when the environment supplies no token', () => {
    const stored = makeTokens({ seed_refresh_token: undefined });
    expect(selectRefreshToken(undefined, stored)).toBe('RT-rotated');
  });

  it('should return undefined when neither source has a token', () => {
    expect(selectRefreshToken(undefined, undefined)).toBeUndefined();
  });
});

describe('token store persistence', () => {
  let storeDir: string;
  let storePath: string;

  beforeEach(() => {
    storeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qbo-token-store-'));
    storePath = path.join(storeDir, 'nested', 'tokens.json');
  });

  afterEach(() => {
    fs.rmSync(storeDir, { recursive: true, force: true });
  });

  it('should round-trip tokens, creating parent directories', () => {
    expect(writeTokenStore(storePath, makeTokens())).toBe(true);
    expect(readTokenStore(storePath)).toEqual(makeTokens());
  });

  it('should write the store readable only by its owner', () => {
    writeTokenStore(storePath, makeTokens());
    expect(fs.statSync(storePath).mode & 0o777).toBe(0o600);
  });

  it('should leave no temporary files behind', () => {
    writeTokenStore(storePath, makeTokens());
    expect(fs.readdirSync(path.dirname(storePath))).toEqual(['tokens.json']);
  });

  it('should overwrite a previous rotation', () => {
    writeTokenStore(storePath, makeTokens({ refresh_token: 'RT-first' }));
    writeTokenStore(storePath, makeTokens({ refresh_token: 'RT-second' }));
    expect(readTokenStore(storePath)?.refresh_token).toBe('RT-second');
  });

  it('should treat a missing store as absent', () => {
    expect(readTokenStore(path.join(storeDir, 'nope.json'))).toBeUndefined();
  });

  it('should treat a malformed store as absent', () => {
    fs.writeFileSync(path.join(storeDir, 'bad.json'), 'not json{');
    expect(readTokenStore(path.join(storeDir, 'bad.json'))).toBeUndefined();
  });

  it('should treat a store without a refresh token as absent', () => {
    fs.writeFileSync(path.join(storeDir, 'partial.json'), JSON.stringify({ realm_id: '1' }));
    expect(readTokenStore(path.join(storeDir, 'partial.json'))).toBeUndefined();
  });

  it('should report failure on stderr rather than throwing, and only once', () => {
    const stderr = jest.spyOn(console, 'error').mockImplementation(() => {});

    // A regular file where a directory is required, so the write genuinely fails.
    const blocker = path.join(storeDir, 'blocker');
    fs.writeFileSync(blocker, 'not a directory');
    const unwritable = path.join(blocker, 'tokens.json');

    expect(writeTokenStore(unwritable, makeTokens())).toBe(false);
    expect(stderr).toHaveBeenCalledWith(
      expect.stringContaining('could not persist rotated refresh token')
    );

    // A store that cannot be written stays unwritable; do not repeat the noise
    // on every subsequent rotation.
    expect(writeTokenStore(unwritable, makeTokens())).toBe(false);
    expect(stderr).toHaveBeenCalledTimes(1);
  });
});
