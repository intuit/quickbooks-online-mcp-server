import { createHash } from "node:crypto";
import { currentTenant } from "../tenant-context.js";
import { TtlCache } from "./ttl-cache.js";

/**
 * Per-realm cache for the reference data an agent reads repeatedly while
 * composing an invoice.
 *
 * Why cache at all: reads are the metered half of Intuit's pricing (CorePlus),
 * and a planner deciding on a customer, an item, a payment term and a tax code
 * will read the same four lists several times inside one conversation. Writes
 * are free and are never cached.
 *
 * Why per realm, keyed and never shared: every key begins with the realm id from
 * the request's tenant scope, so one company's data cannot be served to another
 * even though the cache itself is process-wide. The realm is read from the scope
 * rather than passed in, so no call site can key an entry under the wrong
 * company by mistake.
 *
 * Two users who connect the same company share these entries by design. That is
 * sound because QuickBooks scopes authorization to the company, not the user:
 * both tokens can read exactly the same rows, so there is nothing per-user to
 * leak. Master-account mode is deliberately not enabled, so a realm corresponds
 * to a company somebody explicitly connected.
 *
 * Deliberately NOT cached, because staleness here is a correctness bug rather
 * than a saved request:
 *   invoices          the thing being read, created and updated
 *   invoice SyncToken read immediately before every mutation
 *   customer balance  changes whenever a payment lands
 *   aged receivables  a financial report, expected to be current
 *
 * Invalidation: none needed beyond expiry. This service exposes no tool that
 * writes a customer, item, term or tax code, so an entry can only go stale
 * because someone changed it inside QuickBooks — which the TTL covers. If a
 * write tool for any of these entities is ever added, it must delete the
 * matching prefix here.
 */

/**
 * How long each kind may be stale, chosen from how often it actually changes.
 * Data, not magic numbers scattered through call sites: one table to review.
 */
export const REFERENCE_TTL_MS = {
  /** Names and addresses change during a conversation more than the rest. */
  customer: 60_000,
  /** Prices and descriptions change, but rarely mid-conversation. */
  item: 300_000,
  /** Net-30 and friends are effectively static configuration. */
  term: 900_000,
  /** Tax codes are configuration, and a wrong one is caught on write. */
  taxCode: 900_000,
  /** Company name, country and currency: static for the session's purposes. */
  companyInfo: 900_000,
  /**
   * Multicurrency, sales-tax mode and custom transaction numbers. Changing any of
   * these is a deliberate act inside QuickBooks settings, not something that
   * happens mid-conversation, so a long TTL is safe — and it keeps the probe from
   * costing a metered read before every write.
   */
  preferences: 900_000,
} as const;

export type ReferenceKind = keyof typeof REFERENCE_TTL_MS;

/**
 * A ceiling per kind rather than one shared ceiling, so a burst of item searches
 * cannot evict the company info that every later tool call needs. Sized for a
 * few hundred concurrent conversations against a handful of companies; entries
 * are projected rows, so the whole set is single-digit megabytes.
 */
const MAX_ENTRIES: Record<ReferenceKind, number> = {
  customer: 400,
  item: 400,
  term: 100,
  taxCode: 100,
  companyInfo: 100,
  preferences: 100,
};

const caches: Record<ReferenceKind, TtlCache<unknown>> = {
  customer: new TtlCache<unknown>({ maxEntries: MAX_ENTRIES.customer, ttlMs: REFERENCE_TTL_MS.customer }),
  item: new TtlCache<unknown>({ maxEntries: MAX_ENTRIES.item, ttlMs: REFERENCE_TTL_MS.item }),
  term: new TtlCache<unknown>({ maxEntries: MAX_ENTRIES.term, ttlMs: REFERENCE_TTL_MS.term }),
  taxCode: new TtlCache<unknown>({ maxEntries: MAX_ENTRIES.taxCode, ttlMs: REFERENCE_TTL_MS.taxCode }),
  companyInfo: new TtlCache<unknown>({
    maxEntries: MAX_ENTRIES.companyInfo,
    ttlMs: REFERENCE_TTL_MS.companyInfo,
  }),
  preferences: new TtlCache<unknown>({
    maxEntries: MAX_ENTRIES.preferences,
    ttlMs: REFERENCE_TTL_MS.preferences,
  }),
};

/**
 * Stable digest of a criteria object, so the same search maps to the same key
 * regardless of key order in the incoming JSON. Sorting is recursive because a
 * filter list is an array of objects whose key order is not guaranteed either.
 */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((accumulator, key) => {
        accumulator[key] = canonicalize((value as Record<string, unknown>)[key]);
        return accumulator;
      }, {});
  }
  return value;
}

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonicalize(value)) ?? "null").digest("hex").slice(0, 24);
}

/**
 * Bumped whenever a projection, a TTL or a key's meaning changes.
 *
 * Without it, a deployment that changes what a cached row contains would serve
 * entries written by the previous version — rows missing a field the new code reads,
 * or read under an old TTL policy. Entries from another version simply never match,
 * so a rollout invalidates rather than mixes.
 */
const CACHE_VERSION = "v1";

/** `{realm}:{version}:entity:{kind}:{id}` — a single entity read by id. */
function entityKey(realmId: string, kind: ReferenceKind, id: string): string {
  return `${realmId}:${CACHE_VERSION}:entity:${kind}:${id}`;
}

/** `{realm}:{version}:query:{kind}:{digest}` — a list read, keyed by its criteria. */
function queryKey(realmId: string, kind: ReferenceKind, criteria: unknown): string {
  return `${realmId}:${CACHE_VERSION}:query:${kind}:${digest(criteria)}`;
}

/**
 * Reads one reference entity by id through the cache for its kind.
 * The realm comes from the tenant scope, never from the caller.
 */
export function cachedEntity<T>(kind: ReferenceKind, id: string, load: () => Promise<T>): Promise<T> {
  const { realmId } = currentTenant();
  return (caches[kind] as TtlCache<T>).getOrLoad(entityKey(realmId, kind, id), load);
}

/** Reads a bounded list of reference rows through the cache for its kind. */
export function cachedQuery<T>(kind: ReferenceKind, criteria: unknown, load: () => Promise<T>): Promise<T> {
  const { realmId } = currentTenant();
  return (caches[kind] as TtlCache<T>).getOrLoad(queryKey(realmId, kind, criteria), load);
}

/**
 * Drops everything cached for one company. Called when a grant is revoked or a
 * connector is repointed, so nothing read under an old authorization survives.
 */
export function forgetRealm(realmId: string): number {
  let removed = 0;
  for (const cache of Object.values(caches)) removed += cache.deleteByPrefix(`${realmId}:`);
  return removed;
}

/** Cache counters for the health endpoint. Contains no tenant data. */
export function referenceCacheStats(): Record<ReferenceKind, ReturnType<TtlCache<unknown>["stats"]>> {
  return {
    customer: caches.customer.stats(),
    item: caches.item.stats(),
    term: caches.term.stats(),
    taxCode: caches.taxCode.stats(),
    companyInfo: caches.companyInfo.stats(),
    preferences: caches.preferences.stats(),
  };
}
