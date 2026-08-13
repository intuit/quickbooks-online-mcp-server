/**
 * Bounded cache with an explicit TTL, LRU eviction and single-flight loading.
 *
 * Every rule this service needs from a cache is enforced here rather than at the
 * call sites: an entry always has an expiry, the entry count always has a
 * ceiling, and concurrent misses for the same key issue one upstream call rather
 * than N. That last property matters more than it looks: Intuit allows ten
 * concurrent requests per app, so a planner that fans out five identical
 * customer lookups must not spend five of them.
 *
 * Deliberately timer-free. A setInterval sweeper would keep the event loop alive
 * and hold references to evicted values; instead entries expire lazily on read
 * and the oldest is dropped on insert, which bounds memory without a background
 * task to leak.
 */

export interface TtlCacheOptions {
  /** Hard ceiling on retained entries. The oldest is evicted past this. */
  readonly maxEntries: number;
  /** Default lifetime for entries that do not override it. */
  readonly ttlMs: number;
  /** Injectable clock so expiry can be tested without sleeping. */
  readonly now?: () => number;
}

interface CacheEntry<T> {
  readonly value: T;
  readonly expiresAt: number;
}

export interface TtlCacheStats {
  readonly entries: number;
  readonly hits: number;
  readonly misses: number;
  readonly evictions: number;
  readonly expirations: number;
}

/**
 * Complexity: get, set and delete are O(1). Insertion past `maxEntries` evicts
 * exactly one entry, so set stays O(1) amortised and memory is O(maxEntries).
 * Map preserves insertion order, which is what makes both the LRU touch
 * (delete-then-set moves a key to the end) and the eviction (drop the first key)
 * constant time without a second data structure.
 */
export class TtlCache<T> {
  private readonly entries = new Map<string, CacheEntry<T>>();
  private readonly inFlight = new Map<string, Promise<T>>();
  private readonly now: () => number;

  private hits = 0;
  private misses = 0;
  private evictions = 0;
  private expirations = 0;

  constructor(private readonly options: TtlCacheOptions) {
    if (!Number.isSafeInteger(options.maxEntries) || options.maxEntries < 1) {
      throw new Error("TtlCache maxEntries must be a positive integer");
    }
    if (!Number.isSafeInteger(options.ttlMs) || options.ttlMs < 1) {
      throw new Error("TtlCache ttlMs must be a positive integer");
    }
    this.now = options.now ?? Date.now;
  }

  get(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) {
      this.misses += 1;
      return undefined;
    }
    if (entry.expiresAt <= this.now()) {
      this.entries.delete(key);
      this.expirations += 1;
      this.misses += 1;
      return undefined;
    }
    // Touch: re-inserting moves the key to the end so eviction takes the
    // genuinely least-recently-used entry rather than the oldest write.
    this.entries.delete(key);
    this.entries.set(key, entry);
    this.hits += 1;
    return entry.value;
  }

  set(key: string, value: T, ttlMsOverride?: number): void {
    const ttl = ttlMsOverride ?? this.options.ttlMs;
    if (this.entries.has(key)) this.entries.delete(key);
    else if (this.entries.size >= this.options.maxEntries) this.evictOldest();
    this.entries.set(key, { value, expiresAt: this.now() + ttl });
  }

  /**
   * Returns the cached value, or loads it exactly once for all concurrent
   * callers. A rejected load is never cached and never left in flight, so the
   * next caller retries rather than inheriting a failure.
   */
  async getOrLoad(key: string, load: () => Promise<T>, ttlMsOverride?: number): Promise<T> {
    const cached = this.get(key);
    if (cached !== undefined) return cached;

    const pending = this.inFlight.get(key);
    if (pending) return pending;

    const promise = (async () => {
      const value = await load();
      this.set(key, value, ttlMsOverride);
      return value;
    })();

    this.inFlight.set(key, promise);
    try {
      return await promise;
    } finally {
      this.inFlight.delete(key);
    }
  }

  delete(key: string): void {
    this.entries.delete(key);
  }

  /** Drops every entry whose key starts with `prefix`. O(entries). */
  deleteByPrefix(prefix: string): number {
    let removed = 0;
    for (const key of this.entries.keys()) {
      if (key.startsWith(prefix)) {
        this.entries.delete(key);
        removed += 1;
      }
    }
    return removed;
  }

  clear(): void {
    this.entries.clear();
  }

  stats(): TtlCacheStats {
    return {
      entries: this.entries.size,
      hits: this.hits,
      misses: this.misses,
      evictions: this.evictions,
      expirations: this.expirations,
    };
  }

  private evictOldest(): void {
    const oldest = this.entries.keys().next();
    if (oldest.done === true) return;
    this.entries.delete(oldest.value);
    this.evictions += 1;
  }
}
