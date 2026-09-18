/**
 * QuickBooks returns rich validation faults in the HTTP response body — Message,
 * Detail, a numeric code and the offending element — but the thrown axios error's
 * `message` is only ever the generic "Request failed with status code 400". Reading
 * `message` alone discards the one part of the response that says what went wrong,
 * so callers see an opaque 400 for a bad reference Id, a missing required field, a
 * stale SyncToken and everything else alike.
 *
 * Conversely, serializing the whole error object leaks the other way: node-quickbooks
 * fault envelopes and axios errors carry the outbound request — body, query and
 * `Authorization` headers — so a bare JSON.stringify puts credentials and request
 * context into a tool response handed back to the model.
 *
 * This module therefore does two things: surface the fault detail, and sanitize
 * anything else before it is serialized.
 */

/** Keys whose VALUE is redacted wherever it appears. */
const SENSITIVE_KEY =
  /(authorization|cookie|client[_-]?secret|refresh[_-]?token|access[_-]?token|bearer|password|passwd|api[_-]?key|credential|secret)/i;

/**
 * Keys dropped entirely: these hold the outbound request body or live socket state.
 * `request`/`req`/`res`/`socket`/`agent` are Node internals that are both sensitive
 * and circular. `config` is NOT dropped outright — see safeRequestContext: the model
 * driving this server needs to know which call failed, so method and endpoint are
 * kept while the body, query string and headers are discarded.
 */
const REQUEST_CONTEXT_KEYS = new Set([
  "request", "req", "res", "socket", "agent",
  "headers", "rawHeaders", "_header", "_httpMessage",
]);

/**
 * Reduce an axios request config to the parts that help a caller debug without
 * exposing anything sensitive: the HTTP method and the endpoint path.
 *
 * The query string is stripped — it is where tokens and filter values ride — and
 * the request body (`config.data`) and headers are never included.
 */
function safeRequestContext(config: unknown): Record<string, unknown> | undefined {
  if (!config || typeof config !== "object") return undefined;
  const { method, url, baseURL } = config as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  if (typeof method === "string") out.method = method.toUpperCase();
  const endpoint = typeof url === "string" ? url : typeof baseURL === "string" ? baseURL : undefined;
  if (endpoint) out.url = endpoint.split("?")[0];
  return Object.keys(out).length ? out : undefined;
}

const MAX_DEPTH = 4;
const MAX_ARRAY = 20;
const MAX_STRING = 500;
const REDACTED = "[redacted]";

/**
 * Deep-copy a value, dropping request context, redacting secrets, breaking cycles
 * and capping size. Returns something always safe to JSON.stringify.
 */
function sanitizeValue(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (value === null || value === undefined) return value;

  if (typeof value === "string") {
    return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}… [truncated]` : value;
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "function" || typeof value === "symbol") return undefined;

  /* istanbul ignore else — the typeof checks above are exhaustive for JS values */
  if (typeof value === "object") {
    if (seen.has(value as object)) return "[circular]";
    if (depth >= MAX_DEPTH) return "[truncated]";
    seen.add(value as object);

    if (Array.isArray(value)) {
      const out = value.slice(0, MAX_ARRAY).map((v) => sanitizeValue(v, depth + 1, seen));
      if (value.length > MAX_ARRAY) out.push(`… ${value.length - MAX_ARRAY} more`);
      return out;
    }

    // Errors do not serialize their own message/name, so lift them explicitly.
    const source = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    if (value instanceof Error) {
      result.name = value.name;
      result.message = sanitizeValue(value.message, depth + 1, seen);
    }
    for (const key of Object.keys(source)) {
      if (REQUEST_CONTEXT_KEYS.has(key)) continue;
      if (key === "config") {
        const context = safeRequestContext(source[key]);
        if (context) result[key] = context;
        continue;
      }
      if (SENSITIVE_KEY.test(key)) {
        result[key] = REDACTED;
        continue;
      }
      const sanitized = sanitizeValue(source[key], depth + 1, seen);
      if (sanitized !== undefined) result[key] = sanitized;
    }
    return result;
  }

  /* istanbul ignore next — every typeof branch above is covered */
  return undefined;
}

/**
 * Strip request bodies, auth headers and cycles from an error before serialization,
 * preserving the fields that make a message actionable (Fault.Error[].Message/Detail/code).
 */
export function sanitizeError(error: unknown): unknown {
  return sanitizeValue(error, 0, new WeakSet());
}

interface QboFaultError {
  Message?: string;
  Detail?: string;
  code?: string | number;
  element?: string;
}

/** Pull the QBO Fault out of wherever it landed on the error object. */
function extractFault(error: any): QboFaultError[] | null {
  const data = error?.response?.data ?? error?.data ?? error;
  const errors = data?.Fault?.Error ?? data?.fault?.error;
  if (!Array.isArray(errors) || errors.length === 0) return null;
  return errors;
}

/** Render one fault entry, preferring Detail (specific) over Message (generic). */
function renderFault(fault: QboFaultError): string {
  const text = fault.Detail || fault.Message || "";
  const parts: string[] = [];
  if (text) parts.push(String(text).trim());
  const meta: string[] = [];
  if (fault.element) meta.push(`element: ${fault.element}`);
  if (fault.code !== undefined && fault.code !== null && `${fault.code}`.length > 0) {
    meta.push(`code: ${fault.code}`);
  }
  if (meta.length) parts.push(`(${meta.join(", ")})`);
  return parts.join(" ");
}

/** Serialize a sanitized error, never throwing on cycles or exotic values. */
function safeStringify(error: unknown): string | undefined {
  try {
    return JSON.stringify(sanitizeError(error));
  } catch {
    /* istanbul ignore next — sanitizeError already removes cycles and functions */
    return "[unserializable]";
  }
}

/**
 * Formats an error into a standardized error message.
 * @param error Any error object to format
 * @returns A formatted error message as a string
 */
export function formatError(error: unknown): string {
  const faults = extractFault(error);
  const detail = faults
    ? faults.map(renderFault).filter((s) => s.length > 0).join("; ")
    : "";

  if (error instanceof Error) {
    return detail ? `Error: ${error.message} — ${detail}` : `Error: ${error.message}`;
  } else if (typeof error === "string") {
    return `Error: ${error}`;
  } else if (detail) {
    return `Error: ${detail}`;
  } else {
    return `Unknown error: ${safeStringify(error)}`;
  }
}
