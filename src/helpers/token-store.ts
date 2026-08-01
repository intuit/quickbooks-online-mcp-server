import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * Intuit rotates the refresh token on refresh and expires it after 100 days of
 * disuse, so the newest token is the only durable one. The credentials this
 * server starts with arrive as environment variables (typically an MCP client's
 * config file), which the server cannot safely rewrite, so rotated tokens are
 * persisted to a sidecar store instead.
 */
export interface StoredTokens {
  refresh_token: string;
  realm_id?: string;
  /**
   * The environment-supplied refresh token this rotation chain started from.
   * Lets a re-seeded environment take precedence over a stale store.
   */
  seed_refresh_token?: string;
  updated_at: string;
}

/**
 * Resolves the sidecar token store location. Kept outside the package directory
 * so it survives a reinstall or rebuild.
 * @param env Environment to read the QUICKBOOKS_TOKEN_STORE override from
 * @returns Absolute path to the token store file
 */
export function resolveTokenStorePath(env: NodeJS.ProcessEnv = process.env): string {
  return env.QUICKBOOKS_TOKEN_STORE || path.join(os.homedir(), '.config', 'qbo-mcp', 'tokens.json');
}

/**
 * Decides which refresh token to start with.
 *
 * The store is only trusted when it descends from the refresh token currently
 * configured in the environment. If the two disagree, the operator has supplied
 * fresh credentials by hand and those win — otherwise a stale store would
 * silently override a manual re-authentication.
 *
 * @param seed Refresh token supplied via the environment
 * @param stored Previously persisted tokens, if any
 * @returns The refresh token to use, or undefined when neither source has one
 */
export function selectRefreshToken(
  seed: string | undefined,
  stored: StoredTokens | undefined
): string | undefined {
  if (stored?.refresh_token && stored.seed_refresh_token === seed) {
    return stored.refresh_token;
  }
  return seed;
}

/**
 * Reads the token store, treating any missing or malformed file as absent.
 * @param storePath Path to the token store file
 * @returns The stored tokens, or undefined when unreadable
 */
export function readTokenStore(storePath: string): StoredTokens | undefined {
  try {
    const parsed = JSON.parse(fs.readFileSync(storePath, 'utf-8'));
    return typeof parsed?.refresh_token === 'string' ? parsed : undefined;
  } catch {
    return undefined;
  }
}

/** Reported failures are rate-limited to the first one, see writeTokenStore. */
let reportedWriteFailure = false;

/**
 * Persists tokens atomically with owner-only permissions. Failures are reported
 * on stderr rather than thrown: losing the store degrades to re-reading the
 * environment on restart, but throwing here would fail an otherwise good API call.
 *
 * Only the first failure is reported. A store that cannot be written usually
 * cannot be written on the next rotation either, and refresh runs for the life
 * of the process.
 *
 * Writes must not go to stdout, which carries the MCP stdio protocol.
 *
 * @param storePath Path to the token store file
 * @param tokens Tokens to persist
 * @returns True when the store was written
 */
export function writeTokenStore(storePath: string, tokens: StoredTokens): boolean {
  const tempPath = `${storePath}.${process.pid}.tmp`;
  try {
    fs.mkdirSync(path.dirname(storePath), { recursive: true });
    fs.writeFileSync(tempPath, JSON.stringify(tokens, null, 2), { mode: 0o600 });
    fs.renameSync(tempPath, storePath);
    return true;
  } catch (error: any) {
    if (!reportedWriteFailure) {
      reportedWriteFailure = true;
      console.error(
        `[quickbooks] could not persist rotated refresh token to ${storePath}: ${error.message}`
      );
    }
    try {
      fs.unlinkSync(tempPath);
    } catch {
      // nothing to clean up
    }
    return false;
  }
}
