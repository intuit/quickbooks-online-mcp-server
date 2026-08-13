/**
 * Turns a QuickBooks failure into a message that says what actually went wrong.
 *
 * Replaces upstream's helpers/format-error.ts, which reduces every non-2xx
 * response to `Error: Request failed with status code 401`. node-quickbooks
 * surfaces failures two different ways:
 *
 *  - HTTP 200 carrying a Fault body: the fault object is passed as the error.
 *  - Any non-2xx: the axios Error is passed, and the fault body it carries in
 *    `response.data` is discarded by upstream's formatter.
 *
 * The second case covers the failures that matter most — 401 for an expired
 * token, 400 with fault code 5010 for a stale SyncToken, 429 for throttling —
 * and losing the fault code makes them indistinguishable to both the model and
 * the audit trail.
 *
 * Security: an axios error also carries `config`, including the request headers
 * with the bearer token. Only the status and the fault fields are ever read, so
 * a token cannot reach a message, a log, or a chat transcript through here.
 */

/** Bounds the message so a hostile or degenerate fault cannot flood a response. */
const MAX_MESSAGE_LENGTH = 600;
const MAX_FAULT_ENTRIES = 3;

interface QboFaultEntry {
  Message?: unknown;
  Detail?: unknown;
  code?: unknown;
  element?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** QuickBooks fault envelope, whether it arrived as the error or inside one. */
function readFaultEntries(value: unknown): QboFaultEntry[] {
  if (!isRecord(value)) return [];
  const fault = value.Fault;
  if (!isRecord(fault)) return [];
  const errors = fault.Error;
  if (!Array.isArray(errors)) return [];
  return errors.filter(isRecord).slice(0, MAX_FAULT_ENTRIES) as QboFaultEntry[];
}

function text(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function describeFaultEntry(entry: QboFaultEntry): string {
  const code = text(entry.code);
  const message = text(entry.Message);
  const detail = text(entry.Detail);
  const element = text(entry.element);
  const parts = [
    code ? `code ${code}` : undefined,
    message,
    detail && detail !== message ? detail : undefined,
    element ? `element ${element}` : undefined,
  ].filter((part): part is string => part !== undefined);
  return parts.length > 0 ? parts.join(': ') : 'unspecified fault';
}

/**
 * Reads the HTTP status off an axios-shaped error without depending on axios, and
 * without touching anything else on the error (notably not `config`).
 */
function readStatus(error: unknown): number | undefined {
  if (!isRecord(error)) return undefined;
  const response = error.response;
  if (!isRecord(response)) return undefined;
  const status = response.status;
  return typeof status === 'number' ? status : undefined;
}

function readResponseData(error: unknown): unknown {
  if (!isRecord(error)) return undefined;
  const response = error.response;
  return isRecord(response) ? response.data : undefined;
}

function truncate(message: string): string {
  return message.length <= MAX_MESSAGE_LENGTH ? message : `${message.slice(0, MAX_MESSAGE_LENGTH - 1)}…`;
}

/**
 * QuickBooks fault codes carried by a failure, from either error shape.
 *
 * Callers need the code, not prose: 5010 means a stale SyncToken and is worth one
 * retry after re-reading, while 6140 (duplicate document number) must never be
 * retried because the first attempt may well have succeeded.
 */
export function quickbooksFaultCodes(error: unknown): string[] {
  const entries = readFaultEntries(error).concat(readFaultEntries(readResponseData(error)));
  return entries
    .map((entry) => text(entry.code))
    .filter((code): code is string => code !== undefined);
}

export function hasQuickbooksFaultCode(error: unknown, code: string): boolean {
  return quickbooksFaultCodes(error).includes(code);
}

/** Stale Object Error: the SyncToken sent was not the current one. */
export const QBO_FAULT_STALE_OBJECT = '5010';

/**
 * Duplicate Document Number. Never retried: the number already belongs to an
 * existing invoice, so a retry either fails identically or — in a company that
 * permits duplicates — creates the very second invoice being avoided.
 */
export const QBO_FAULT_DUPLICATE_DOC_NUMBER = '6140';

/** Same signature as upstream's helper, so none of the 141 handlers change. */
export function formatError(error: unknown): string {
  // A fault body handed to us directly (HTTP 200 + Fault).
  const directFaults = readFaultEntries(error);
  if (directFaults.length > 0) {
    return truncate(`QuickBooks fault — ${directFaults.map(describeFaultEntry).join(' | ')}`);
  }

  // A non-2xx: recover the fault the transport error was hiding.
  const status = readStatus(error);
  const nestedFaults = readFaultEntries(readResponseData(error));
  if (status !== undefined && nestedFaults.length > 0) {
    return truncate(`QuickBooks ${status} — ${nestedFaults.map(describeFaultEntry).join(' | ')}`);
  }
  if (status !== undefined) {
    // No fault body (common for 401 and for gateway errors); the status is the signal.
    const reason = error instanceof Error ? error.message : undefined;
    return truncate(`QuickBooks ${status}${reason ? ` — ${reason}` : ''}`);
  }

  if (error instanceof Error) return truncate(`Error: ${error.message}`);
  if (typeof error === 'string') return truncate(`Error: ${error}`);
  try {
    return truncate(`Unknown error: ${JSON.stringify(error)}`);
  } catch {
    return 'Unknown error: unserializable value';
  }
}
