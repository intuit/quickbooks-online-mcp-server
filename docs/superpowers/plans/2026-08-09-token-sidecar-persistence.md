# Token Sidecar Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist a rotated QuickBooks refresh token somewhere the server both owns and re-reads, so env-var-based deployments (the normal MCP host config shape) don't silently lose rotation on restart — fixes #117.

**Architecture:** A new sidecar file, `tokens.json`, colocated with `.env` in the install root. A pure `resolveRefreshToken()` function implements the "descended from" chain-trust rule (a stale sidecar can't override a manually-pasted new token). `QuickbooksClient` calls it at module init and writes the sidecar on every rotation and on first-run OAuth completion, alongside the existing `.env` write.

**Tech Stack:** TypeScript (Node ESM/NodeNext), Jest with `jest.unstable_mockModule` for fs mocking, existing `fs`/`path` Node built-ins (no new dependencies).

## Global Constraints

- Sidecar path: `QUICKBOOKS_TOKEN_STORE_PATH` env override, else `<install-root>/tokens.json` (same install-root resolution `.env` already uses: `path.join(__dirname, '..', '..', 'tokens.json')` from `src/clients/`).
- Sidecar write is atomic: temp file + `renameSync`, mode `0o600`; symlinked `tokens.json` writes through to the `realpathSync` target (dangling-symlink relative targets resolve against the link's own directory, not `process.cwd()`) — same pattern as the existing `.env` write in `saveTokensToEnv`.
- Sidecar read never throws: missing file → `null` silently; corrupt JSON or permission error → `null` + a logged warning.
- No persistence failure (either `.env` or sidecar) may fail `authenticate()`/`refreshAccessToken()` — the in-memory token stays valid for the running process regardless.
- `descendedFrom` never changes value once a chain starts, except when the host-supplied `QUICKBOOKS_REFRESH_TOKEN` itself changes (operator manual re-auth), which resets the chain.

---

### Task 1: `resolveRefreshToken()` — pure chain-trust logic

**Files:**
- Create: `src/clients/token-sidecar.ts`
- Test: `tests/unit/clients/token-sidecar-resolve.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface TokenSidecar {
    refreshToken: string;
    realmId?: string;
    descendedFrom: string;
    updatedAt: string;
  }

  export interface ResolvedTokens {
    refreshToken: string | undefined;
    realmId: string | undefined;
    chainRoot: string | undefined;
  }

  export function resolveRefreshToken(
    configuredToken: string | undefined,
    configuredRealmId: string | undefined,
    sidecar: TokenSidecar | null
  ): ResolvedTokens
  ```

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/clients/token-sidecar-resolve.test.ts`:

```ts
import { resolveRefreshToken } from '../../../src/clients/token-sidecar';

describe('resolveRefreshToken', () => {
  it('uses the configured token when no sidecar exists', () => {
    const result = resolveRefreshToken('host-token', '12345', null);
    expect(result).toEqual({ refreshToken: 'host-token', realmId: '12345', chainRoot: 'host-token' });
  });

  it('trusts the sidecar when its chain root matches the configured token', () => {
    const sidecar = { refreshToken: 'rotated-token', realmId: '99999', descendedFrom: 'host-token', updatedAt: '2026-08-01T00:00:00.000Z' };
    const result = resolveRefreshToken('host-token', '12345', sidecar);
    expect(result).toEqual({ refreshToken: 'rotated-token', realmId: '99999', chainRoot: 'host-token' });
  });

  it('falls back to the sidecar realmId only when the sidecar itself omits one', () => {
    const sidecar = { refreshToken: 'rotated-token', descendedFrom: 'host-token', updatedAt: '2026-08-01T00:00:00.000Z' };
    const result = resolveRefreshToken('host-token', '12345', sidecar);
    expect(result.realmId).toBe('12345');
  });

  it('ignores a stale sidecar when the configured token has changed (manual re-auth)', () => {
    const sidecar = { refreshToken: 'rotated-token', realmId: '99999', descendedFrom: 'old-host-token', updatedAt: '2026-08-01T00:00:00.000Z' };
    const result = resolveRefreshToken('new-host-token', '12345', sidecar);
    expect(result).toEqual({ refreshToken: 'new-host-token', realmId: '12345', chainRoot: 'new-host-token' });
  });

  it('does not trust a sidecar when there is no configured token to compare against', () => {
    const sidecar = { refreshToken: 'rotated-token', realmId: '99999', descendedFrom: 'host-token', updatedAt: '2026-08-01T00:00:00.000Z' };
    const result = resolveRefreshToken(undefined, undefined, sidecar);
    expect(result).toEqual({ refreshToken: undefined, realmId: undefined, chainRoot: undefined });
  });

  it('handles no configured token and no sidecar (fresh OAuth needed)', () => {
    const result = resolveRefreshToken(undefined, undefined, null);
    expect(result).toEqual({ refreshToken: undefined, realmId: undefined, chainRoot: undefined });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `NODE_OPTIONS='--experimental-vm-modules' npx jest tests/unit/clients/token-sidecar-resolve.test.ts`
Expected: FAIL — `Cannot find module '../../../src/clients/token-sidecar'`

- [ ] **Step 3: Write the minimal implementation**

Create `src/clients/token-sidecar.ts`:

```ts
export interface TokenSidecar {
  refreshToken: string;
  realmId?: string;
  descendedFrom: string;
  updatedAt: string;
}

export interface ResolvedTokens {
  refreshToken: string | undefined;
  realmId: string | undefined;
  chainRoot: string | undefined;
}

// Implements the "descended from" chain-trust rule from the #117 design:
// a sidecar is only trusted while its chain root still matches the token
// the host config currently supplies. If an operator pastes a new token
// into their host config (manual re-auth), the chain resets and the
// configured value wins — a stale sidecar can never silently override that.
export function resolveRefreshToken(
  configuredToken: string | undefined,
  configuredRealmId: string | undefined,
  sidecar: TokenSidecar | null
): ResolvedTokens {
  if (sidecar && configuredToken && sidecar.descendedFrom === configuredToken) {
    return {
      refreshToken: sidecar.refreshToken,
      realmId: sidecar.realmId ?? configuredRealmId,
      chainRoot: sidecar.descendedFrom,
    };
  }
  return {
    refreshToken: configuredToken,
    realmId: configuredRealmId,
    chainRoot: configuredToken,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `NODE_OPTIONS='--experimental-vm-modules' npx jest tests/unit/clients/token-sidecar-resolve.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/clients/token-sidecar.ts tests/unit/clients/token-sidecar-resolve.test.ts
git commit -m "feat(token-sidecar): add pure chain-trust resolution logic"
```

---

### Task 2: `loadTokenSidecar()` / `saveTokenSidecar()` — file I/O

**Files:**
- Modify: `src/clients/token-sidecar.ts`
- Test: `tests/unit/clients/token-sidecar-io.test.ts`

**Interfaces:**
- Consumes: `TokenSidecar` (Task 1)
- Produces:
  ```ts
  export function getSidecarPath(): string
  export function loadTokenSidecar(): TokenSidecar | null
  export function saveTokenSidecar(data: TokenSidecar): void
  ```

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/clients/token-sidecar-io.test.ts`:

```ts
import { jest } from '@jest/globals';

let lstatBehavior: 'regular' | 'symlink' | 'throws' = 'regular';
let realpathBehavior: 'ok' | 'enoent' = 'ok';
let readFileBehavior: 'ok' | 'enoent' | 'corrupt' | 'eacces' = 'ok';
const REAL_PATH = '/persistent-volume/tokens.json';
let readlinkTarget = '/fresh-pvc/tokens.json';

const writeFileSyncSpy = jest.fn<(p: string, data: string, options?: any) => void>();
const renameSyncSpy = jest.fn<(o: string, n: string) => void>();
const mkdirSyncSpy = jest.fn<(p: string, options?: any) => void>();
const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

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
    unlinkSync: jest.fn(),
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
    consoleErrorSpy.mockClear();
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
    lstatBehavior = 'regular';
    realpathBehavior = 'ok';
    readlinkTarget = '/fresh-pvc/tokens.json';
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
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `NODE_OPTIONS='--experimental-vm-modules' npx jest tests/unit/clients/token-sidecar-io.test.ts`
Expected: FAIL — `loadTokenSidecar`/`saveTokenSidecar` not exported

- [ ] **Step 3: Write the minimal implementation**

Append to `src/clients/token-sidecar.ts` (add these imports at the top of the file, above the existing interfaces):

```ts
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
```

Add at the bottom of `src/clients/token-sidecar.ts`:

```ts
export function getSidecarPath(): string {
  return process.env.QUICKBOOKS_TOKEN_STORE_PATH || path.join(__dirname, '..', '..', 'tokens.json');
}

export function loadTokenSidecar(): TokenSidecar | null {
  try {
    const raw = fs.readFileSync(getSidecarPath(), 'utf-8');
    return JSON.parse(raw) as TokenSidecar;
  } catch (e: any) {
    if (e?.code === 'ENOENT') return null;
    console.error(`[qbo-client] Failed to read token sidecar, ignoring: ${e?.message ?? e}`);
    return null;
  }
}

function isSymbolicLink(filePath: string): boolean {
  try {
    return fs.lstatSync(filePath).isSymbolicLink();
  } catch {
    return false;
  }
}

// Atomic-write pattern mirrors QuickbooksClient.saveTokensToEnv (same
// symlink/dangling-symlink handling, same rationale — see that method's
// comments for why a persistent-volume-mounted symlink needs write-through
// rather than rename).
export function saveTokenSidecar(data: TokenSidecar): void {
  const tokenPath = getSidecarPath();
  fs.mkdirSync(path.dirname(tokenPath), { recursive: true });

  const content = JSON.stringify(data, null, 2) + '\n';

  if (isSymbolicLink(tokenPath)) {
    let realPath: string;
    try {
      realPath = fs.realpathSync(tokenPath);
    } catch (e: any) {
      if (e?.code === 'ENOENT') {
        const linkTarget = fs.readlinkSync(tokenPath);
        realPath = path.isAbsolute(linkTarget)
          ? linkTarget
          : path.resolve(path.dirname(tokenPath), linkTarget);
      } else {
        throw e;
      }
    }
    fs.writeFileSync(realPath, content, { mode: 0o600 });
  } else {
    const tmpPath = `${tokenPath}.tmp.${process.pid}`;
    try {
      fs.writeFileSync(tmpPath, content, { mode: 0o600 });
      fs.renameSync(tmpPath, tokenPath);
    } catch (err) {
      try { fs.unlinkSync(tmpPath); } catch { /* best effort */ }
      throw err;
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `NODE_OPTIONS='--experimental-vm-modules' npx jest tests/unit/clients/token-sidecar-io.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add src/clients/token-sidecar.ts tests/unit/clients/token-sidecar-io.test.ts
git commit -m "feat(token-sidecar): add sidecar file read/write with atomic+symlink handling"
```

---

### Task 3: Wire sidecar-aware resolution into `QuickbooksClient` startup

**Files:**
- Modify: `src/clients/quickbooks-client.ts`
- Test: `tests/unit/clients/quickbooks-client.sidecar-startup.test.ts`

**Interfaces:**
- Consumes: `loadTokenSidecar`, `resolveRefreshToken`, `TokenSidecar` (Tasks 1-2)
- Produces: `QuickbooksClient` gains a `tokenChainRoot?: string` private field, set from a new `tokenChainRoot` constructor config property.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/clients/quickbooks-client.sidecar-startup.test.ts`:

```ts
import { jest } from '@jest/globals';

process.env.QUICKBOOKS_CLIENT_ID = 'test-client-id';
process.env.QUICKBOOKS_CLIENT_SECRET = 'test-client-secret';
process.env.QUICKBOOKS_REFRESH_TOKEN = 'host-token';
process.env.QUICKBOOKS_REALM_ID = '12345';
process.env.QUICKBOOKS_ENVIRONMENT = 'sandbox';
process.env.QUICKBOOKS_REDIRECT_URI = 'http://localhost:8000/callback';

const sidecarContent = JSON.stringify({
  refreshToken: 'rotated-from-sidecar',
  realmId: '99999',
  descendedFrom: 'host-token',
  updatedAt: '2026-08-01T00:00:00.000Z',
});

jest.unstable_mockModule('fs', () => ({
  default: {
    readFileSync: jest.fn(() => sidecarContent),
    existsSync: jest.fn(() => true),
    writeFileSync: jest.fn(),
    renameSync: jest.fn(),
    unlinkSync: jest.fn(),
    mkdirSync: jest.fn(),
    lstatSync: jest.fn(() => ({ isSymbolicLink: () => false })),
  },
}));

jest.unstable_mockModule('intuit-oauth', () => {
  class MockOAuthClient {
    static scopes = { Accounting: 'com.intuit.quickbooks.accounting' };
    refreshUsingToken = jest.fn();
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
  default: { createServer: jest.fn(() => ({ listen: jest.fn(), close: jest.fn(), on: jest.fn(), address: jest.fn() })) },
}));

const { quickbooksClient } = await import('../../../src/clients/quickbooks-client');

describe('QuickbooksClient startup sidecar resolution', () => {
  it('uses the trusted sidecar refresh token instead of the raw configured env value', () => {
    expect((quickbooksClient as unknown as { refreshToken?: string }).refreshToken).toBe('rotated-from-sidecar');
  });

  it('uses the sidecar realmId when the chain is trusted', () => {
    expect((quickbooksClient as unknown as { realmId?: string }).realmId).toBe('99999');
  });

  it('sets tokenChainRoot to the descendedFrom value from the trusted sidecar', () => {
    expect((quickbooksClient as unknown as { tokenChainRoot?: string }).tokenChainRoot).toBe('host-token');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `NODE_OPTIONS='--experimental-vm-modules' npx jest tests/unit/clients/quickbooks-client.sidecar-startup.test.ts`
Expected: FAIL — `refreshToken` is `'host-token'` (raw env value), not `'rotated-from-sidecar'`

- [ ] **Step 3: Write the minimal implementation**

In `src/clients/quickbooks-client.ts`, add the import alongside the existing top-of-file imports:

```ts
import { loadTokenSidecar, resolveRefreshToken } from './token-sidecar.js';
```

Replace this block:

```ts
const client_id = process.env.QUICKBOOKS_CLIENT_ID;
const client_secret = process.env.QUICKBOOKS_CLIENT_SECRET;
const refresh_token = process.env.QUICKBOOKS_REFRESH_TOKEN;
const realm_id = process.env.QUICKBOOKS_REALM_ID;
const environment = process.env.QUICKBOOKS_ENVIRONMENT || 'sandbox';
```

with:

```ts
const client_id = process.env.QUICKBOOKS_CLIENT_ID;
const client_secret = process.env.QUICKBOOKS_CLIENT_SECRET;
const environment = process.env.QUICKBOOKS_ENVIRONMENT || 'sandbox';

// A rotated refresh token may live in the sidecar file rather than the
// host-supplied env var — see token-sidecar.ts for the chain-trust rule
// that decides which one wins (#117).
const tokenSidecar = loadTokenSidecar();
const resolvedTokens = resolveRefreshToken(
  process.env.QUICKBOOKS_REFRESH_TOKEN,
  process.env.QUICKBOOKS_REALM_ID,
  tokenSidecar
);
const refresh_token = resolvedTokens.refreshToken;
const realm_id = resolvedTokens.realmId;
const token_chain_root = resolvedTokens.chainRoot;
```

Add the `tokenChainRoot` field and constructor param. In the `QuickbooksClient` class, next to the existing `private refreshToken?: string;`:

```ts
  private tokenChainRoot?: string;
```

In the constructor's `config` parameter type, add `tokenChainRoot?: string;` next to `refreshToken?: string;`, and in the constructor body next to `this.refreshToken = config.refreshToken;`:

```ts
    this.tokenChainRoot = config.tokenChainRoot;
```

At the bottom of the file, update the `quickbooksClient` construction to pass it through:

```ts
export const quickbooksClient = new QuickbooksClient({
  clientId: client_id,
  clientSecret: client_secret,
  refreshToken: refresh_token,
  realmId: realm_id,
  environment: environment,
  redirectUri: redirect_uri,
  tokenChainRoot: token_chain_root,
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `NODE_OPTIONS='--experimental-vm-modules' npx jest tests/unit/clients/quickbooks-client.sidecar-startup.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Run the full existing suite to check for regressions**

Run: `npm test`
Expected: PASS — `quickbooks-client.auth.test.ts` mocks `fs.readFileSync` to always throw ENOENT, so `loadTokenSidecar()` returns `null` there and `resolveRefreshToken` falls through to the raw `'stale-refresh-token'` env value, unchanged from today's behavior.

- [ ] **Step 6: Commit**

```bash
git add src/clients/quickbooks-client.ts tests/unit/clients/quickbooks-client.sidecar-startup.test.ts
git commit -m "feat(quickbooks-client): resolve refresh token via sidecar chain-trust at startup"
```

---

### Task 4: Persist rotated tokens to the sidecar on refresh

**Files:**
- Modify: `src/clients/quickbooks-client.ts`
- Modify: `tests/unit/clients/save-tokens-to-env.test.ts`

**Interfaces:**
- Consumes: `saveTokenSidecar`, `TokenSidecar` (Task 2); `this.tokenChainRoot` (Task 3)

- [ ] **Step 1: Write the failing test**

In `tests/unit/clients/save-tokens-to-env.test.ts`, add `saveTokenSidecar` behavior to the existing `fs` mock (it already mocks `writeFileSync`/`renameSync`/etc. — add `mkdirSync: jest.fn()` to the mock object alongside the existing keys), then add a new test at the end of the `describe` block:

```ts
  it('also persists the rotated token to the sidecar file with an unchanged chain root', async () => {
    lstatBehavior = 'regular';

    await quickbooksClient.authenticate();

    const sidecarCall = writeFileSyncSpy.mock.calls.find(([p]) => String(p).includes('tokens.json.tmp.'));
    expect(sidecarCall).toBeDefined();
    const [, content] = sidecarCall!;
    const parsed = JSON.parse(content as string);
    expect(parsed.refreshToken).toBe(`rotated-${tokenCounter}`);
    expect(parsed.descendedFrom).toBe('initial-token');
  });

  it('keeps descendedFrom unchanged across two successive rotations', async () => {
    lstatBehavior = 'regular';

    await quickbooksClient.authenticate();
    (quickbooksClient as any).accessTokenExpiry = new Date(0);
    (quickbooksClient as any).authInFlight = undefined;
    tokenCounter++;
    refreshDispatch.mockResolvedValue({
      token: { access_token: `access-${tokenCounter}`, expires_in: 3600, refresh_token: `rotated-${tokenCounter}` },
    });
    await quickbooksClient.authenticate();

    const sidecarCalls = writeFileSyncSpy.mock.calls.filter(([p]) => String(p).includes('tokens.json.tmp.'));
    const lastCall = sidecarCalls[sidecarCalls.length - 1];
    const parsed = JSON.parse(lastCall[1] as string);
    expect(parsed.refreshToken).toBe(`rotated-${tokenCounter}`);
    expect(parsed.descendedFrom).toBe('initial-token');
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `NODE_OPTIONS='--experimental-vm-modules' npx jest tests/unit/clients/save-tokens-to-env.test.ts`
Expected: FAIL — no `tokens.json.tmp.` write found (sidecar isn't written yet)

- [ ] **Step 3: Write the minimal implementation**

In `src/clients/quickbooks-client.ts`, add the import next to the one added in Task 3:

```ts
import { loadTokenSidecar, resolveRefreshToken, saveTokenSidecar } from './token-sidecar.js';
```

In `refreshAccessToken()`, inside the `if (newRefreshToken && newRefreshToken !== this.refreshToken)` block, immediately after the existing `saveTokensToEnv()` try/catch, add a second independent try/catch:

```ts
        const newRefreshToken = token.refresh_token;
        if (newRefreshToken && newRefreshToken !== this.refreshToken) {
          this.refreshToken = newRefreshToken;
          try {
            this.saveTokensToEnv();
            console.error('[qbo-client] Refresh token rotated and persisted to .env');
          } catch (persistErr) {
            console.error('[qbo-client] Failed to persist rotated refresh token:', persistErr);
          }
          try {
            saveTokenSidecar({
              refreshToken: newRefreshToken,
              realmId: this.realmId,
              descendedFrom: this.tokenChainRoot ?? newRefreshToken,
              updatedAt: new Date().toISOString(),
            });
          } catch (persistErr) {
            console.error('[qbo-client] Failed to persist rotated refresh token to sidecar:', persistErr);
          }
        }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `NODE_OPTIONS='--experimental-vm-modules' npx jest tests/unit/clients/save-tokens-to-env.test.ts`
Expected: PASS (all tests in the file, including the two new ones)

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/clients/quickbooks-client.ts tests/unit/clients/save-tokens-to-env.test.ts
git commit -m "feat(quickbooks-client): persist rotated refresh token to sidecar on rotation"
```

---

### Task 5: Persist to the sidecar on first-run OAuth completion

**Files:**
- Modify: `src/clients/quickbooks-client.ts`
- Modify: `tests/unit/clients/quickbooks-client.auth.test.ts`

**Interfaces:**
- Consumes: `saveTokenSidecar` (Task 2)

- [ ] **Step 1: Write the failing test**

In `tests/unit/clients/quickbooks-client.auth.test.ts`, first give the test file a named spy for `writeFileSync` so assertions can inspect its calls. Replace:

```ts
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
```

with:

```ts
const writeFileSyncSpy = jest.fn();
jest.unstable_mockModule('fs', () => ({
  default: {
    readFileSync: jest.fn(() => {
      throw enoent();
    }),
    existsSync: jest.fn(() => false),
    writeFileSync: writeFileSyncSpy,
    renameSync: jest.fn(),
    unlinkSync: jest.fn(),
    mkdirSync: jest.fn(),
  },
}));
```

Then, at the end of the `'falls back to the interactive OAuth flow...'` test (after the existing assertions, before its closing `});`), add:

```ts
    // The first-run OAuth completion also seeds the sidecar so the very
    // next rotation has a chain root to compare against.
    const sidecarCall = writeFileSyncSpy.mock.calls.find(([p]: [string]) => p.includes('tokens.json.tmp.'));
    expect(sidecarCall).toBeDefined();
    const sidecarContent = JSON.parse(sidecarCall![1] as string);
    expect(sidecarContent.refreshToken).toBe('flow-refresh-token');
    expect(sidecarContent.descendedFrom).toBe('flow-refresh-token');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `NODE_OPTIONS='--experimental-vm-modules' npx jest tests/unit/clients/quickbooks-client.auth.test.ts`
Expected: FAIL — no `tokens.json.tmp.` write found

- [ ] **Step 3: Write the minimal implementation**

In `src/clients/quickbooks-client.ts`, inside `startOAuthFlow()`'s callback success handler, after the existing:

```ts
            // Save tokens
            this.refreshToken = tokens.refresh_token;
            this.realmId = tokens.realmId;
            this.saveTokensToEnv();
```

add:

```ts
            if (this.refreshToken) {
              this.tokenChainRoot = this.refreshToken;
              try {
                saveTokenSidecar({
                  refreshToken: this.refreshToken,
                  realmId: this.realmId,
                  descendedFrom: this.tokenChainRoot,
                  updatedAt: new Date().toISOString(),
                });
              } catch (persistErr) {
                console.error('[qbo-client] Failed to persist new refresh token to sidecar:', persistErr);
              }
            }
```

(Placed after `this.saveTokensToEnv()`, wrapped in its own try/catch — a failure here is logged and swallowed, matching Task 4's rotation-path pattern and the Global Constraint that no persistence failure may block authenticate()/refreshAccessToken(). Correction: an earlier draft of this note claimed the opposite — that a failure here would propagate to the outer catch and return a 500 — which contradicted the code above it. Verified during Task 5's review; ruling: the try/catch is correct, the prose was wrong.)

- [ ] **Step 4: Run test to verify it passes**

Run: `NODE_OPTIONS='--experimental-vm-modules' npx jest tests/unit/clients/quickbooks-client.auth.test.ts`
Expected: PASS (all tests, including the extended one)

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/clients/quickbooks-client.ts tests/unit/clients/quickbooks-client.auth.test.ts
git commit -m "feat(quickbooks-client): seed token sidecar on first-run OAuth completion"
```

---

### Task 6: Document the sidecar in README and CHANGELOG

**Files:**
- Modify: `README.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Check the current README for its env var documentation section**

Run: `grep -n "QUICKBOOKS_REFRESH_TOKEN\|## " README.md | head -30`

Find the table or section documenting `QUICKBOOKS_*` env vars.

- [ ] **Step 2: Add `QUICKBOOKS_TOKEN_STORE_PATH` to that section**

Add a row/entry (matching whatever format the existing env var docs use — table row or bullet):

```
`QUICKBOOKS_TOKEN_STORE_PATH` — optional. Overrides where the rotated-refresh-token sidecar (`tokens.json`) is stored. Defaults to the install root, alongside `.env`. See #117 for why this exists: env-var-based deployments (the normal MCP host config shape) can't read a rotated token back out of `.env`, so the server also persists it here and re-reads it at startup.
```

- [ ] **Step 3: Add a CHANGELOG entry**

Check `CHANGELOG.md`'s existing entry format (`head -30 CHANGELOG.md`) and add a new entry following that same format:

```
- Fix: rotated refresh tokens are now also persisted to a `tokens.json` sidecar file (in addition to `.env`), so env-var-based deployments (Docker, MCP host `env` config blocks) don't silently lose token rotation on restart. Override the sidecar location with `QUICKBOOKS_TOKEN_STORE_PATH`. (#117)
```

- [ ] **Step 4: Commit**

```bash
git add README.md CHANGELOG.md
git commit -m "docs: document token sidecar and QUICKBOOKS_TOKEN_STORE_PATH"
```

---

## Self-Review Notes

- **Spec coverage:** storage location/format (Task 1-2), startup resolution (Task 3), persistence on rotation (Task 4), first-run OAuth persistence (Task 5), error handling/atomic write mechanics (Task 2), testing (Tasks 1-5 each ship their own tests), README/docs (Task 6). All five design sections have a task.
- **Type consistency:** `TokenSidecar`, `ResolvedTokens`, `resolveRefreshToken`, `loadTokenSidecar`, `saveTokenSidecar`, `getSidecarPath`, `tokenChainRoot` are named identically everywhere they appear across tasks.
- **No placeholders:** every step has real code, real test assertions, real commands.
