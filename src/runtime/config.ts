import { DEFAULT_PDF_LIMITS, type PdfHandleStoreLimits } from "./pdf-handles.js";
import { DEFAULT_TRANSPORT_LIMITS, type TransportPolicyLimits } from "./qbo-transport.js";
import type { QboEnvironment } from "./tenant-context.js";

/**
 * Service configuration. Deliberately tiny: this service holds no QuickBooks
 * credentials, because the calling API owns token acquisition and refresh and
 * passes the tenant's token on every request.
 */
export interface ServiceConfig {
  readonly port: number;
  /** Shared secret proving the caller is our API, not the open internet. */
  readonly serviceToken: string;
  /** Which Intuit environment the tokens we are handed belong to. */
  readonly environment: QboEnvironment;
  readonly requestTimeoutMs: number;
  readonly maxRequestBytes: number;
  readonly version: string;
  /**
   * This service's externally reachable origin, used to turn a PDF handle into an
   * absolute link. Optional: without it the tools return a path and the caller
   * composes the URL. Never inferred from request headers, which a caller
   * controls.
   */
  readonly publicBaseUrl?: string;
  readonly pdf: PdfHandleStoreLimits;
  /**
   * Key the calling API signs its tenant bindings with — separate from the service
   * token, which travels on every request and may be recorded by a proxy.
   * Undefined only when binding verification is deliberately switched off.
   */
  readonly transport: TransportPolicyLimits;
  readonly bindingKey?: string;
  readonly executionAssertionKey?: string;
  readonly previousExecutionAssertionKey?: string;
  readonly requireExecutionAssertion: boolean;
  /**
   * True when requests without a verified binding are accepted. Local development
   * only: it means the service trusts that whoever holds the service token paired
   * the realm and the token correctly, and no write can be attributed to a user.
   */
  readonly allowUnboundRequests: boolean;
}

const DEFAULTS = {
  port: 8790,
  requestTimeoutMs: 20_000,
  maxRequestBytes: 1_048_576,
} as const;

/** Long enough that guessing is hopeless; rejects placeholder values. */
const MIN_SERVICE_TOKEN_LENGTH = 32;
const MIN_BINDING_KEY_LENGTH = 32;
const MIN_EXECUTION_ASSERTION_KEY_LENGTH = 32;

function readInt(raw: string | undefined, fallback: number, name: string, min: number, max: number): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  }
  return value;
}

/**
 * A download link handed to a person must not be plain HTTP off the loopback
 * interface: it carries a single-use capability for a document containing a
 * customer's name, address and amounts.
 */
function readPublicBaseUrl(raw: string | undefined): string | undefined {
  const value = (raw ?? "").trim();
  if (value === "") return undefined;

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("QBO_MCP_PUBLIC_BASE_URL must be an absolute URL");
  }
  if (parsed.search !== "" || parsed.hash !== "") {
    throw new Error("QBO_MCP_PUBLIC_BASE_URL must not carry a query string or fragment");
  }
  const isLoopback = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
  if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && isLoopback)) {
    throw new Error("QBO_MCP_PUBLIC_BASE_URL must use https, except on localhost");
  }
  return value.replace(/\/+$/, "");
}

/**
 * Intuit's ceiling is ten concurrent requests per app, counted across companies —
 * and this cap is per process, so a deployment running N instances must divide.
 * Capped at 10 here so no single instance can be configured past the provider limit.
 */
function readTransportLimits(env: NodeJS.ProcessEnv): TransportPolicyLimits {
  return {
    maxConcurrent: readInt(
      env.QBO_MAX_CONCURRENT_REQUESTS,
      DEFAULT_TRANSPORT_LIMITS.maxConcurrent,
      "QBO_MAX_CONCURRENT_REQUESTS",
      1,
      10,
    ),
    maxQueued: readInt(env.QBO_MAX_QUEUED_REQUESTS, DEFAULT_TRANSPORT_LIMITS.maxQueued, "QBO_MAX_QUEUED_REQUESTS", 0, 4_096),
    maxRetries: readInt(env.QBO_MAX_RETRIES, DEFAULT_TRANSPORT_LIMITS.maxRetries, "QBO_MAX_RETRIES", 0, 5),
    maxRetryDelayMs: readInt(
      env.QBO_MAX_RETRY_DELAY_MS,
      DEFAULT_TRANSPORT_LIMITS.maxRetryDelayMs,
      "QBO_MAX_RETRY_DELAY_MS",
      100,
      60_000,
    ),
    breakerFailureThreshold: readInt(
      env.QBO_BREAKER_FAILURE_THRESHOLD,
      DEFAULT_TRANSPORT_LIMITS.breakerFailureThreshold,
      "QBO_BREAKER_FAILURE_THRESHOLD",
      1,
      1_000,
    ),
    breakerCooldownMs: readInt(
      env.QBO_BREAKER_COOLDOWN_MS,
      DEFAULT_TRANSPORT_LIMITS.breakerCooldownMs,
      "QBO_BREAKER_COOLDOWN_MS",
      1_000,
      600_000,
    ),
    maxReadsPerRequest: readInt(
      env.QBO_MAX_READS_PER_REQUEST,
      DEFAULT_TRANSPORT_LIMITS.maxReadsPerRequest,
      "QBO_MAX_READS_PER_REQUEST",
      1,
      1_000,
    ),
  };
}

function readPdfLimits(env: NodeJS.ProcessEnv): PdfHandleStoreLimits {
  const maxEntryBytes = readInt(
    env.QBO_PDF_MAX_ENTRY_BYTES,
    DEFAULT_PDF_LIMITS.maxEntryBytes,
    "QBO_PDF_MAX_ENTRY_BYTES",
    16 * 1024,
    64 * 1024 * 1024,
  );
  const maxTotalBytes = readInt(
    env.QBO_PDF_MAX_TOTAL_BYTES,
    DEFAULT_PDF_LIMITS.maxTotalBytes,
    "QBO_PDF_MAX_TOTAL_BYTES",
    maxEntryBytes,
    512 * 1024 * 1024,
  );
  return {
    ttlMs: readInt(env.QBO_PDF_HANDLE_TTL_MS, DEFAULT_PDF_LIMITS.ttlMs, "QBO_PDF_HANDLE_TTL_MS", 30_000, 1_800_000),
    maxHandles: readInt(env.QBO_PDF_MAX_HANDLES, DEFAULT_PDF_LIMITS.maxHandles, "QBO_PDF_MAX_HANDLES", 1, 1_024),
    maxTotalBytes,
    maxEntryBytes,
  };
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServiceConfig {
  const serviceToken = (env.QBO_MCP_SERVICE_TOKEN ?? "").trim();
  if (serviceToken.length < MIN_SERVICE_TOKEN_LENGTH) {
    throw new Error(
      `QBO_MCP_SERVICE_TOKEN must be set to at least ${MIN_SERVICE_TOKEN_LENGTH} characters; ` +
        "without it the service would be an open QuickBooks proxy",
    );
  }

  const environment = (env.QBO_ENVIRONMENT ?? "sandbox").trim();
  if (environment !== "sandbox" && environment !== "production") {
    throw new Error("QBO_ENVIRONMENT must be sandbox or production");
  }

  // Fail closed: verification is on unless a deployment explicitly turns it off,
  // and turning it off is refused outright against production QuickBooks, where an
  // unattributable write lands on somebody's real books.
  const bindingKey = (env.QBO_MCP_BINDING_KEY ?? "").trim();
  const executionAssertionKey = (env.QBO_MCP_EXECUTION_ASSERTION_KEY ?? "").trim();
  const previousExecutionAssertionKey = (env.QBO_MCP_EXECUTION_ASSERTION_PREVIOUS_KEY ?? "").trim() || undefined;
  const requireExecutionAssertion = (env.QBO_REQUIRE_EXECUTION_ASSERTION ?? (environment === "production" ? "true" : "false")).trim() === "true";
  const allowUnboundRequests = (env.QBO_ALLOW_UNBOUND_REQUESTS ?? "").trim() === "true";
  if (bindingKey === "" && !allowUnboundRequests && !requireExecutionAssertion) {
    throw new Error(
      "QBO_MCP_BINDING_KEY must be set so the realm in the path can be checked against the presented " +
        "access token; set QBO_ALLOW_UNBOUND_REQUESTS=true only for local development",
    );
  }
  if (bindingKey !== "" && bindingKey.length < MIN_BINDING_KEY_LENGTH) {
    throw new Error(`QBO_MCP_BINDING_KEY must be at least ${MIN_BINDING_KEY_LENGTH} characters`);
  }
  if (allowUnboundRequests && environment === "production") {
    throw new Error("QBO_ALLOW_UNBOUND_REQUESTS cannot be used against production QuickBooks");
  }
  if (requireExecutionAssertion && executionAssertionKey.length < MIN_EXECUTION_ASSERTION_KEY_LENGTH) {
    throw new Error(`QBO_MCP_EXECUTION_ASSERTION_KEY must be at least ${MIN_EXECUTION_ASSERTION_KEY_LENGTH} characters when execution assertions are required`);
  }

  return {
    port: readInt(env.PORT, DEFAULTS.port, "PORT", 1, 65_535),
    serviceToken,
    environment,
    requestTimeoutMs: readInt(
      env.QBO_REQUEST_TIMEOUT_MS,
      DEFAULTS.requestTimeoutMs,
      "QBO_REQUEST_TIMEOUT_MS",
      1_000,
      120_000,
    ),
    maxRequestBytes: readInt(
      env.QBO_MAX_REQUEST_BYTES,
      DEFAULTS.maxRequestBytes,
      "QBO_MAX_REQUEST_BYTES",
      1_024,
      16_777_216,
    ),
    version: (env.QBO_MCP_VERSION ?? "0.1.0").trim(),
    publicBaseUrl: readPublicBaseUrl(env.QBO_MCP_PUBLIC_BASE_URL),
    pdf: readPdfLimits(env),
    transport: readTransportLimits(env),
    bindingKey: bindingKey === "" ? undefined : bindingKey,
    executionAssertionKey: executionAssertionKey === "" ? undefined : executionAssertionKey,
    previousExecutionAssertionKey,
    requireExecutionAssertion,
    allowUnboundRequests,
  };
}
