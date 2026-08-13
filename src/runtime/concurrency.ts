/**
 * A counting semaphore with a bounded wait queue.
 *
 * Intuit allows ten concurrent requests per app across every company, so the limit
 * that matters is not per tenant — it is the whole process. Exceeding it earns 429s
 * for everybody, including the users who were not the cause.
 *
 * The queue is bounded on purpose. An unbounded one converts a QuickBooks slowdown
 * into unbounded memory growth and requests that wait long past the point anyone
 * still wants the answer; refusing early is the honest failure.
 */

export class ConcurrencyLimitError extends Error {
  constructor(waiting: number) {
    super(`QuickBooks request queue is full (${waiting} already waiting); try again shortly`);
    this.name = "ConcurrencyLimitError";
  }
}

export class Semaphore {
  private active = 0;
  private readonly waiters: Array<(release: () => void) => void> = [];

  constructor(
    private readonly permits: number,
    private readonly maxWaiting: number,
  ) {
    if (!Number.isSafeInteger(permits) || permits < 1) throw new Error("permits must be a positive integer");
    if (!Number.isSafeInteger(maxWaiting) || maxWaiting < 0) throw new Error("maxWaiting must be zero or more");
  }

  /** Resolves with the release function. Rejects rather than queueing forever. */
  acquire(): Promise<() => void> {
    if (this.active < this.permits) {
      this.active += 1;
      return Promise.resolve(this.releaseOnce());
    }
    if (this.waiters.length >= this.maxWaiting) {
      return Promise.reject(new ConcurrencyLimitError(this.waiters.length));
    }
    return new Promise<() => void>((resolve) => {
      this.waiters.push(resolve);
    });
  }

  stats(): { active: number; waiting: number; permits: number } {
    return { active: this.active, waiting: this.waiters.length, permits: this.permits };
  }

  /**
   * Guards against a caller releasing twice, which would inflate the permit count
   * and silently defeat the limit.
   */
  private releaseOnce(): () => void {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const next = this.waiters.shift();
      if (next) {
        // Hand the permit straight over; active stays as it is.
        next(this.releaseOnce());
        return;
      }
      this.active -= 1;
    };
  }
}
