import { randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Short-lived, single-use handles for invoice PDFs.
 *
 * Upstream's get_invoice_pdf either base64-encodes the whole PDF into the tool
 * response or writes it to the filesystem. Inline base64 puts tens of kilobytes
 * of binary into a model's context, where it is useless and expensive; the disk
 * path gives this service a reason to touch the filesystem, which it should not
 * have. So the bytes are fetched once, parked here under an unguessable handle,
 * and the tool answers with a link.
 *
 * The handle is 256 bits of randomness, usable exactly once, valid for minutes,
 * and bound to the realm it was fetched for. Presenting it still requires the
 * service token on the download route, so a leaked link alone reaches nothing:
 * invoice PDFs carry customer names, addresses and amounts, and links end up in
 * access logs and chat transcripts.
 *
 * Timer-free for the same reason as the reference cache: a sweeper interval would
 * hold the event loop open and keep evicted buffers reachable. Entries expire on
 * access and the oldest are dropped when a new one does not fit.
 */

export interface PdfHandleStoreLimits {
  readonly ttlMs: number;
  readonly maxHandles: number;
  readonly maxTotalBytes: number;
  readonly maxEntryBytes: number;
}

/**
 * Safe defaults, so a deployment that forgets to configure the store still has a
 * bounded one rather than an unbounded one.
 */
export const DEFAULT_PDF_LIMITS: PdfHandleStoreLimits = {
  ttlMs: 300_000,
  maxHandles: 64,
  maxTotalBytes: 64 * 1024 * 1024,
  // QuickBooks invoice PDFs run tens of kilobytes; a multi-megabyte one is
  // already pathological, and buffering 50 MiB of it (upstream's cap) is worse.
  maxEntryBytes: 8 * 1024 * 1024,
};

interface PdfEntry {
  readonly realmId: string;
  readonly invoiceId: string;
  readonly bytes: Buffer;
  readonly expiresAt: number;
}

export interface StoredPdf {
  readonly handle: string;
  readonly expiresAt: number;
  readonly byteLength: number;
}

export class PdfTooLargeError extends Error {
  constructor(byteLength: number, limit: number) {
    super(`PDF is ${byteLength} bytes, above the ${limit} byte limit this service will hold`);
    this.name = "PdfTooLargeError";
  }
}

const HANDLE_BYTES = 32;

class PdfHandleStore {
  private readonly entries = new Map<string, PdfEntry>();
  private totalBytes = 0;
  private limits: PdfHandleStoreLimits = DEFAULT_PDF_LIMITS;

  configure(limits: PdfHandleStoreLimits): void {
    this.limits = limits;
  }

  currentLimits(): PdfHandleStoreLimits {
    return this.limits;
  }

  store(input: { realmId: string; invoiceId: string; bytes: Buffer }): StoredPdf {
    const { bytes } = input;
    if (bytes.length > this.limits.maxEntryBytes) {
      throw new PdfTooLargeError(bytes.length, this.limits.maxEntryBytes);
    }

    this.dropExpired();
    while (
      this.entries.size >= this.limits.maxHandles ||
      this.totalBytes + bytes.length > this.limits.maxTotalBytes
    ) {
      if (!this.evictOldest()) break;
    }

    const handle = randomBytes(HANDLE_BYTES).toString("base64url");
    const expiresAt = Date.now() + this.limits.ttlMs;
    this.entries.set(handle, { realmId: input.realmId, invoiceId: input.invoiceId, bytes, expiresAt });
    this.totalBytes += bytes.length;
    return { handle, expiresAt, byteLength: bytes.length };
  }

  /**
   * Consumes a handle. Returns nothing when it is unknown, expired, or belongs to
   * a different company — one indistinguishable answer, so the route cannot be
   * used to probe which handles or realms exist.
   *
   * A realm mismatch deliberately leaves the entry alone. Consuming it would let
   * a request for the wrong company destroy a download somebody else is about to
   * make, and the binding is there to catch confusion, not to hold off an
   * attacker who already has both the handle and the service token. An expired
   * entry is dropped, because it is dead either way.
   */
  take(realmId: string, handle: string): { bytes: Buffer; invoiceId: string } | undefined {
    const entry = this.entries.get(handle);
    if (!entry) return undefined;

    if (entry.expiresAt <= Date.now()) {
      this.forget(handle, entry);
      return undefined;
    }
    if (!sameRealm(entry.realmId, realmId)) return undefined;

    this.forget(handle, entry);
    return { bytes: entry.bytes, invoiceId: entry.invoiceId };
  }

  /** Drops everything held for one company, e.g. when its grant is revoked. */
  forgetRealm(realmId: string): number {
    let removed = 0;
    for (const [handle, entry] of this.entries) {
      if (entry.realmId === realmId) {
        this.forget(handle, entry);
        removed += 1;
      }
    }
    return removed;
  }

  stats(): { handles: number; totalBytes: number } {
    return { handles: this.entries.size, totalBytes: this.totalBytes };
  }

  private forget(handle: string, entry: PdfEntry): void {
    this.entries.delete(handle);
    this.totalBytes -= entry.bytes.length;
    if (this.totalBytes < 0) this.totalBytes = 0;
  }

  /**
   * The TTL is constant, so insertion order is expiry order and sweeping from the
   * front stops at the first live entry. O(expired), not O(size).
   */
  private dropExpired(): void {
    const now = Date.now();
    for (const [handle, entry] of this.entries) {
      if (entry.expiresAt > now) return;
      this.forget(handle, entry);
    }
  }

  private evictOldest(): boolean {
    const oldest = this.entries.entries().next();
    if (oldest.done === true) return false;
    const [handle, entry] = oldest.value;
    this.forget(handle, entry);
    return true;
  }
}

/** Constant-time so the route cannot be used to compare realms by timing. */
function sameRealm(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

const store = new PdfHandleStore();

export function configurePdfHandleStore(limits: PdfHandleStoreLimits): void {
  store.configure(limits);
}

export function storePdfForDownload(input: {
  realmId: string;
  invoiceId: string;
  bytes: Buffer;
}): StoredPdf {
  return store.store(input);
}

export function takePdfForDownload(
  realmId: string,
  handle: string,
): { bytes: Buffer; invoiceId: string } | undefined {
  return store.take(realmId, handle);
}

export function pdfHandleTtlMs(): number {
  return store.currentLimits().ttlMs;
}

export function forgetRealmPdfs(realmId: string): number {
  return store.forgetRealm(realmId);
}

export function pdfHandleStats(): { handles: number; totalBytes: number } {
  return store.stats();
}
