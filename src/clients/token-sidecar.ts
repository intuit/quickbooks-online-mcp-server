import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
