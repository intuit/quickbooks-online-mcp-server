import { createRequire } from "node:module";
import { ConcurrencyLimitError, Semaphore } from "./concurrency.js";
import { log } from "./logger.js";
import { tenantOrNull } from "./tenant-context.js";

/**
 * One policy applied to every QuickBooks HTTP call, wherever it originates.
 *
 * The choke point is the axios instance node-quickbooks resolves, rather than this
 * service's own wrapper functions. That matters: the vendored handlers call the
 * library directly, so a policy applied only at our wrappers would silently exempt
 * read_invoice, get_aged_receivables and get_customer_balance — three of the calls
 * most likely to be issued in a burst.
 *
 * What the policy does, and why each part exists:
 *
 *  concurrency   Intuit allows ten concurrent requests per app, counted across every
 *                company. Exceeding it earns 429s for users who were not the cause,
 *                so the cap is process-wide and set below the provider's.
 *  429 retry     A throttled request was never processed, so re-issuing it is safe
 *                even for a write. Bounded attempts, Retry-After honoured, capped.
 *  breaker       When QuickBooks is failing outright, continuing to send is how a
 *                provider outage becomes our outage. Opening sheds load and fails
 *                fast with something a caller can act on.
 *  read counting Reads are the metered half of Intuit's pricing, so every GET is
 *                counted and attributed to the company and actor that caused it.
 *
 * Known limit: the cap is per process. Running several instances of this service
 * multiplies it, so `QBO_MAX_CONCURRENT_REQUESTS` must be set to the provider limit
 * divided by the instance count until a shared limiter exists.
 */

export interface TransportPolicyLimits {
  readonly maxConcurrent: number;
  readonly maxQueued: number;
  readonly maxRetries: number;
  readonly maxRetryDelayMs: number;
  readonly breakerFailureThreshold: number;
  readonly breakerCooldownMs: number;
  /** Refuses a single tool call that would burn an implausible number of reads. */
  readonly maxReadsPerRequest: number;
}

export const DEFAULT_TRANSPORT_LIMITS: TransportPolicyLimits = {
  // Below Intuit's ten, leaving headroom for a retry burst.
  maxConcurrent: 6,
  maxQueued: 64,
  maxRetries: 2,
  maxRetryDelayMs: 5_000,
  breakerFailureThreshold: 8,
  breakerCooldownMs: 15_000,
  maxReadsPerRequest: 40,
};

export class QboCircuitOpenError extends Error {
  constructor(retryInMs: number) {
    super(`QuickBooks is failing repeatedly; requests are paused for another ${Math.ceil(retryInMs / 1000)}s`);
    this.name = "QboCircuitOpenError";
  }
}

export class ReadBudgetError extends Error {
  constructor(limit: number) {
    super(
      `This request already made ${limit} QuickBooks reads, which is the per-request ceiling. ` +
        "Narrow the search or read fewer records rather than paging through everything.",
    );
    this.name = "ReadBudgetError";
  }
}

interface AxiosLikeError {
  response?: { status?: number; headers?: Record<string, unknown> };
  config?: unknown;
  code?: string;
}

interface AxiosLike {
  defaults: { timeout?: number };
  interceptors: {
    request: { use(onFulfilled: (config: MutableConfig) => Promise<MutableConfig>): void };
    response: {
      use(onFulfilled: (response: unknown) => unknown, onRejected: (error: unknown) => unknown): void;
    };
  };
  (config: unknown): Promise<unknown>;
}

/** Our bookkeeping, carried on the request config axios hands back to us. */
interface MutableConfig {
  method?: string;
  url?: string;
  __qboRelease?: () => void;
  __qboAttempt?: number;
}

let limits: TransportPolicyLimits = DEFAULT_TRANSPORT_LIMITS;
let semaphore = new Semaphore(DEFAULT_TRANSPORT_LIMITS.maxConcurrent, DEFAULT_TRANSPORT_LIMITS.maxQueued);
let installed = false;

/** Cumulative counters for the health endpoint. No tenant data. */
const counters = { reads: 0, writes: 0, throttled: 0, retried: 0, breakerTrips: 0, rejected: 0 };

const breaker = { consecutiveFailures: 0, openedAt: 0 };

/** Per-request read tally, scoped by the tenant's requestId. Bounded by TTL sweep. */
const readsByRequest = new Map<string, number>();

export function configureTransportPolicy(next: TransportPolicyLimits): void {
  limits = next;
  semaphore = new Semaphore(next.maxConcurrent, next.maxQueued);
}

export function transportStats(): Record<string, unknown> {
  return { ...counters, ...semaphore.stats(), breakerOpen: breakerIsOpen(), trackedRequests: readsByRequest.size };
}

/** Called when a request finishes, so the per-request tally cannot accumulate. */
export function forgetRequestReads(requestId: string): void {
  readsByRequest.delete(requestId);
}

export function readsForRequest(requestId: string): number {
  return readsByRequest.get(requestId) ?? 0;
}

function breakerIsOpen(): boolean {
  if (breaker.openedAt === 0) return false;
  if (Date.now() - breaker.openedAt >= limits.breakerCooldownMs) {
    // Half-open: let the next request through and judge the provider by its answer.
    breaker.openedAt = 0;
    breaker.consecutiveFailures = 0;
    return false;
  }
  return true;
}

function recordOutcome(failed: boolean): void {
  if (!failed) {
    breaker.consecutiveFailures = 0;
    return;
  }
  breaker.consecutiveFailures += 1;
  if (breaker.consecutiveFailures >= limits.breakerFailureThreshold && breaker.openedAt === 0) {
    breaker.openedAt = Date.now();
    counters.breakerTrips += 1;
    log.warn("qbo_circuit_opened", { consecutiveFailures: breaker.consecutiveFailures });
  }
}

/** A failure that says the provider is unwell, as opposed to the request being wrong. */
function isProviderFailure(error: AxiosLikeError): boolean {
  const status = error.response?.status;
  if (status === undefined) return true; // network, DNS, socket, timeout
  return status >= 500;
}

function retryAfterMs(error: AxiosLikeError): number {
  const raw = error.response?.headers?.["retry-after"];
  const seconds = typeof raw === "string" ? Number(raw) : typeof raw === "number" ? raw : Number.NaN;
  if (Number.isFinite(seconds) && seconds > 0) return Math.min(seconds * 1000, limits.maxRetryDelayMs);
  return Math.min(1_000, limits.maxRetryDelayMs);
}

function countCall(config: MutableConfig): void {
  const isRead = (config.method ?? "get").toLowerCase() === "get";
  if (isRead) counters.reads += 1;
  else counters.writes += 1;

  const tenant = tenantOrNull();
  if (!isRead || tenant === null) return;

  const used = (readsByRequest.get(tenant.requestId) ?? 0) + 1;
  readsByRequest.set(tenant.requestId, used);
  if (used > limits.maxReadsPerRequest) throw new ReadBudgetError(limits.maxReadsPerRequest);
}

/**
 * Installs the policy on node-quickbooks' axios instance. Idempotent: interceptors
 * would otherwise stack on every call and multiply the accounting.
 */
export function installQboTransportPolicy(requestTimeoutMs: number): void {
  if (installed) return;
  installed = true;

  let axios: AxiosLike;
  try {
    const requireFromHere = createRequire(import.meta.url);
    const requireFromQuickbooks = createRequire(requireFromHere.resolve("node-quickbooks"));
    axios = requireFromQuickbooks("axios") as AxiosLike;
  } catch {
    log.error("qbo_transport_policy_not_installed", { reason: "axios could not be resolved" });
    installed = false;
    return;
  }

  axios.defaults.timeout = requestTimeoutMs;

  axios.interceptors.request.use(async (config) => {
    if (breakerIsOpen()) {
      counters.rejected += 1;
      throw new QboCircuitOpenError(limits.breakerCooldownMs - (Date.now() - breaker.openedAt));
    }
    // Counted before the permit so a runaway request is refused rather than queued.
    countCall(config);
    try {
      config.__qboRelease = await semaphore.acquire();
    } catch (error) {
      if (error instanceof ConcurrencyLimitError) counters.rejected += 1;
      throw error;
    }
    return config;
  });

  axios.interceptors.response.use(
    (response) => {
      release((response as { config?: MutableConfig }).config);
      recordOutcome(false);
      return response;
    },
    async (error: unknown) => {
      const failure = error as AxiosLikeError;
      const config = failure.config as MutableConfig | undefined;
      release(config);

      const status = failure.response?.status;

      if (status === 429 && config !== undefined) {
        counters.throttled += 1;
        const attempt = (config.__qboAttempt ?? 0) + 1;
        if (attempt <= limits.maxRetries) {
          config.__qboAttempt = attempt;
          const delay = retryAfterMs(failure);
          log.warn("qbo_throttled_retrying", { attempt, delayMs: delay });
          counters.retried += 1;
          await sleep(delay);
          // Re-issued through axios, so it passes the interceptors again and takes a
          // fresh permit rather than holding one across the wait.
          return axios(config);
        }
        log.warn("qbo_throttled_giving_up", { attempts: attempt });
      }

      recordOutcome(isProviderFailure(failure));
      throw error;
    },
  );

  log.info("qbo_transport_policy_installed", {
    maxConcurrent: limits.maxConcurrent,
    maxQueued: limits.maxQueued,
    maxRetries: limits.maxRetries,
  });
}

function release(config: MutableConfig | undefined): void {
  config?.__qboRelease?.();
  if (config !== undefined) config.__qboRelease = undefined;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    // Never hold the process open on a retry wait during shutdown.
    timer.unref();
  });
}

/** Test seam: forget accumulated state without restarting the process. */
export function resetTransportPolicyState(): void {
  counters.reads = 0;
  counters.writes = 0;
  counters.throttled = 0;
  counters.retried = 0;
  counters.breakerTrips = 0;
  counters.rejected = 0;
  breaker.consecutiveFailures = 0;
  breaker.openedAt = 0;
  readsByRequest.clear();
}
