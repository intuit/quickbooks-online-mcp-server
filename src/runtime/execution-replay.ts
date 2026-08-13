const DEFAULT_TTL_MS = 60_000;
const DEFAULT_MAX_ENTRIES = 10_000;

export class ExecutionReplayStore {
  private readonly entries = new Map<string, number>();

  constructor(private readonly ttlMs = DEFAULT_TTL_MS, private readonly maxEntries = DEFAULT_MAX_ENTRIES) {}

  claim(key: string, now = Date.now()): boolean {
    this.evict(now);
    if (this.entries.has(key)) return false;
    if (this.entries.size >= this.maxEntries) this.evictOldest();
    this.entries.set(key, now + this.ttlMs);
    return true;
  }

  private evict(now: number): void {
    for (const [key, expiresAt] of this.entries) {
      if (expiresAt <= now) this.entries.delete(key);
    }
  }

  private evictOldest(): void {
    const oldest = this.entries.keys().next().value as string | undefined;
    if (oldest) this.entries.delete(oldest);
  }
}
