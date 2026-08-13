import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Per-request QuickBooks tenancy.
 *
 * The 141 vendored handlers were written for a process that serves exactly one
 * company, reading credentials from process.env at module load. Rather than
 * editing them, this context carries the tenant and the replacement client
 * resolves from it. Absence of a context is an error, never a fallback to
 * ambient credentials: a bug that loses the scope must fail loudly, not quietly
 * operate on whichever company was configured last.
 */
export interface QboTenant {
  /** QuickBooks company id, from the request path. */
  readonly realmId: string;
  /** Intuit OAuth access token for that company, from the request. */
  readonly accessToken: string;
  readonly environment: QboEnvironment;
  /** Correlates logs across the request; never contains tenant data. */
  readonly requestId: string;
  /**
   * Who the calling API says is acting, taken from the verified tenant binding —
   * never from a plain header. Absent only when binding verification is switched
   * off, which is permitted for local development alone.
   *
   * This is what makes a write attributable and what an idempotency key is scoped
   * to, so that one user's replay can never return another user's invoice.
   */
  readonly actorUserId?: string;
  readonly chatbotId?: string;
  readonly connectorId?: string;
  readonly tenantId?: string;
  readonly connectionId?: string;
  readonly invocationId?: string;
  readonly executionAssertionJti?: string;
}

export type QboEnvironment = "sandbox" | "production";

export const TENANT_ERROR_CODES = {
  MISSING: "TENANT_CONTEXT_MISSING",
  INVALID: "TENANT_CONTEXT_INVALID",
} as const;

export type TenantErrorCode = (typeof TENANT_ERROR_CODES)[keyof typeof TENANT_ERROR_CODES];

export class QboTenantError extends Error {
  constructor(
    readonly code: TenantErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "QboTenantError";
  }
}

/**
 * Realm ids are numeric strings. Intuit does not publish a fixed length, so the
 * bound is deliberately generous while still rejecting path traversal, query
 * injection and absurd input before it can reach a URL.
 */
const REALM_ID_PATTERN = /^[0-9]{6,32}$/;
const MIN_ACCESS_TOKEN_LENGTH = 16;
const MAX_ACCESS_TOKEN_LENGTH = 8_192;

const storage = new AsyncLocalStorage<QboTenant>();

/** Validates untrusted request input into a tenant. Throws, never coerces. */
export function assertTenant(candidate: {
  realmId: unknown;
  accessToken: unknown;
  environment: unknown;
  requestId: unknown;
  /** Already verified by the caller; carried through, not re-validated as input. */
  actorUserId?: string;
  chatbotId?: string;
  connectorId?: string;
  tenantId?: string;
  connectionId?: string;
  invocationId?: string;
  executionAssertionJti?: string;
}): QboTenant {
  const { realmId, accessToken, environment, requestId } = candidate;

  if (typeof realmId !== "string" || !REALM_ID_PATTERN.test(realmId)) {
    throw new QboTenantError(TENANT_ERROR_CODES.INVALID, "realmId must be a numeric company id");
  }
  if (
    typeof accessToken !== "string" ||
    accessToken.length < MIN_ACCESS_TOKEN_LENGTH ||
    accessToken.length > MAX_ACCESS_TOKEN_LENGTH
  ) {
    throw new QboTenantError(TENANT_ERROR_CODES.INVALID, "accessToken was absent or implausible");
  }
  if (environment !== "sandbox" && environment !== "production") {
    throw new QboTenantError(TENANT_ERROR_CODES.INVALID, "environment must be sandbox or production");
  }
  if (typeof requestId !== "string" || requestId.length === 0 || requestId.length > 128) {
    throw new QboTenantError(TENANT_ERROR_CODES.INVALID, "requestId must be a short non-empty string");
  }

  return {
    realmId,
    accessToken,
    environment,
    requestId,
    actorUserId: candidate.actorUserId,
    chatbotId: candidate.chatbotId,
    connectorId: candidate.connectorId,
    tenantId: candidate.tenantId,
    connectionId: candidate.connectionId,
    invocationId: candidate.invocationId,
    executionAssertionJti: candidate.executionAssertionJti,
  };
}

/**
 * Runs `fn` with `tenant` visible to everything it awaits. Nothing outside this
 * scope can observe the tenant, so concurrent requests cannot see each other.
 */
export function runInTenantScope<T>(tenant: QboTenant, fn: () => Promise<T>): Promise<T> {
  return storage.run(tenant, fn);
}

/** The current request's tenant. Throws when called outside a scope. */
export function currentTenant(): QboTenant {
  const tenant = storage.getStore();
  if (!tenant) {
    throw new QboTenantError(
      TENANT_ERROR_CODES.MISSING,
      "No QuickBooks tenant in scope: a handler ran outside runInTenantScope()",
    );
  }
  return tenant;
}

/** For logging and health checks that must not throw. */
export function tenantOrNull(): QboTenant | null {
  return storage.getStore() ?? null;
}
