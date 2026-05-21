/**
 * Redis wrapper for persisting QBO OAuth tokens across pod restarts.
 *
 * Per-user sessions are stored under:
 *   qbo:user:<sha256(access_token)>  → UserSession JSON   (TTL 101 days)
 *   qbo:rt:<sha256(refresh_token)>   → session key string (TTL 101 days)
 *
 * The access_token sent by Claude as a Bearer on every MCP request is used as
 * the session discriminator so each person gets their own isolated QBO auth state.
 *
 * If REDIS_URL is not set (local dev / CI) the module is a no-op.
 */

import IORedis from "ioredis";
const { default: Redis } = IORedis as any;
type RedisClient = InstanceType<typeof Redis>;

const CONNECT_TIMEOUT_MS = 3_000;
const SESSION_TTL = 101 * 24 * 3600; // 101 days — slightly longer than Intuit's 100-day refresh token

export interface UserSession {
  refreshToken: string;
  realmId: string;
}

let client: RedisClient | null = null;
let clientInitialized = false;

function getClient(): RedisClient | null {
  if (clientInitialized) return client;
  clientInitialized = true;

  const url = process.env.REDIS_URL;
  if (!url) {
    console.error("[redis-token-store] REDIS_URL not set — token persistence via Redis disabled");
    return null;
  }

  client = new Redis(url, {
    connectTimeout: CONNECT_TIMEOUT_MS,
    maxRetriesPerRequest: null,  // retry indefinitely per command
    enableOfflineQueue: true,
    // Reconnect with exponential backoff capped at 5s, no give-up limit.
    retryStrategy: (times: number) => Math.min(times * 200, 5000),
  });

  client.on("error", (err: Error) => {
    // Log but never throw — Redis being down must not break QBO calls.
    console.error("[redis-token-store] Redis error:", err.message);
  });

  return client;
}

// ── Per-user session API ──────────────────────────────────────────────────────

/** Read a user session. Returns null when not found or Redis is unavailable. */
export async function getSession(sessionKey: string): Promise<UserSession | null> {
  try {
    const redis = getClient();
    if (!redis) return null;
    const value = await redis.get(sessionKey);
    return value ? (JSON.parse(value) as UserSession) : null;
  } catch (err) {
    console.error("[redis-token-store] Failed to read session:", err);
    return null;
  }
}

/** Write (or overwrite) a user session with a rolling TTL. */
export async function setSession(sessionKey: string, session: UserSession): Promise<void> {
  try {
    const redis = getClient();
    if (!redis) return;
    await redis.set(sessionKey, JSON.stringify(session), "EX", SESSION_TTL);
  } catch (err) {
    console.error("[redis-token-store] Failed to write session:", err);
  }
}

/**
 * Store a reverse index from refresh-token hash → session key.
 * Used when Claude calls POST /token with grant_type=refresh_token so we can
 * find the existing session (and inherit its realmId) even though the Bearer
 * token has changed.
 */
export async function setRtIndex(rtHash: string, sessionKey: string): Promise<void> {
  try {
    const redis = getClient();
    if (!redis) return;
    await redis.set(`qbo:rt:${rtHash}`, sessionKey, "EX", SESSION_TTL);
  } catch (err) {
    console.error("[redis-token-store] Failed to write rt index:", err);
  }
}

/** Look up a session key by refresh-token hash. */
export async function getSessionKeyByRt(rtHash: string): Promise<string | null> {
  try {
    const redis = getClient();
    if (!redis) return null;
    return await redis.get(`qbo:rt:${rtHash}`);
  } catch (err) {
    console.error("[redis-token-store] Failed to read rt index:", err);
    return null;
  }
}
