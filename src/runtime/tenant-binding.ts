import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verifies that the realm in the path and the Intuit token in the bearer were
 * paired by our API, for a named user, and recently.
 *
 * Without this the service infers a tenant from two independent request parts and
 * trusts that they belong together. The service token proves the caller is our
 * API, but not that this particular token belongs to this particular company —
 * an API-side bug pairing them wrongly would read another company's books with a
 * perfectly valid request, and nothing here could tell.
 *
 * So the API signs a claim naming the realm, the actor and a fingerprint of the
 * access token. The service recomputes the fingerprint from the bearer it was
 * actually handed and checks it matches. A mismatched pair is refused before any
 * QuickBooks call, with a distinct code so the failure is not confused with an
 * expired grant.
 *
 * The signing key is separate from the service token on purpose. The service token
 * travels on every request and may be recorded by a proxy; if it were also the
 * signing key, anything that saw a request could forge a binding.
 *
 * The token itself is never in the claim, only its digest — the bearer is already
 * present, and putting it in a second place doubles the chance of it being logged.
 */

/** Compact and versioned, so the format can change without guessing. */
const BINDING_VERSION = "v1";
/** A binding is minted per request; minutes of tolerance is generous already. */
const MAX_AGE_SECONDS = 300;
const MAX_FUTURE_SKEW_SECONDS = 60;
/** Bounds parsing work on a hostile header. */
const MAX_BINDING_LENGTH = 2_048;

export const BINDING_HEADER = "x-qbo-tenant-binding";

export const BINDING_ERROR_CODES = {
  MISSING: "TENANT_BINDING_MISSING",
  MALFORMED: "TENANT_BINDING_MALFORMED",
  SIGNATURE: "TENANT_BINDING_SIGNATURE_INVALID",
  EXPIRED: "TENANT_BINDING_EXPIRED",
  REALM_MISMATCH: "TENANT_BINDING_REALM_MISMATCH",
  TOKEN_MISMATCH: "TENANT_BINDING_TOKEN_MISMATCH",
} as const;

export type BindingErrorCode = (typeof BINDING_ERROR_CODES)[keyof typeof BINDING_ERROR_CODES];

export class QboBindingError extends Error {
  constructor(
    readonly code: BindingErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "QboBindingError";
  }
}

/** What the API asserts. Field names are short because this rides on a header. */
interface BindingClaims {
  /** realm */
  r?: unknown;
  /** actor user id */
  a?: unknown;
  /** chatbot id */
  c?: unknown;
  /** connector id */
  k?: unknown;
  /** access token fingerprint */
  t?: unknown;
  /** issued at, unix seconds */
  i?: unknown;
}

export interface VerifiedBinding {
  readonly realmId: string;
  readonly actorUserId: string;
  readonly chatbotId: string;
  readonly connectorId: string;
  readonly issuedAt: number;
}

/** Truncated to 32 hex characters: 128 bits, far beyond collision reach here. */
export function accessTokenFingerprint(accessToken: string): string {
  return createHash("sha256").update(accessToken, "utf8").digest("hex").slice(0, 32);
}

export function signTenantBinding(
  claims: {
    realmId: string;
    actorUserId: string;
    chatbotId: string;
    connectorId: string;
    accessToken: string;
    issuedAt: number;
  },
  key: string,
): string {
  const payload: BindingClaims = {
    r: claims.realmId,
    a: claims.actorUserId,
    c: claims.chatbotId,
    k: claims.connectorId,
    t: accessTokenFingerprint(claims.accessToken),
    i: claims.issuedAt,
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${BINDING_VERSION}.${encoded}.${sign(encoded, key)}`;
}

function sign(encodedPayload: string, key: string): string {
  return createHmac("sha256", key).update(`${BINDING_VERSION}.${encodedPayload}`, "utf8").digest("base64url");
}

function equal(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function requiredString(value: unknown, max: number): string | undefined {
  return typeof value === "string" && value.length > 0 && value.length <= max ? value : undefined;
}

/**
 * Verifies a binding against the request it arrived with.
 *
 * Order matters: the signature is checked before any claim is believed, so a
 * forged header cannot reach the comparison logic and turn it into an oracle.
 */
export function verifyTenantBinding(input: {
  binding: string | undefined;
  realmId: string;
  accessToken: string;
  key: string;
  nowSeconds?: number;
}): VerifiedBinding {
  const { binding, realmId, accessToken, key } = input;
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);

  if (binding === undefined || binding.length === 0) {
    throw new QboBindingError(BINDING_ERROR_CODES.MISSING, `${BINDING_HEADER} was not presented`);
  }
  if (binding.length > MAX_BINDING_LENGTH) {
    throw new QboBindingError(BINDING_ERROR_CODES.MALFORMED, `${BINDING_HEADER} is implausibly long`);
  }

  const parts = binding.split(".");
  if (parts.length !== 3 || parts[0] !== BINDING_VERSION) {
    throw new QboBindingError(BINDING_ERROR_CODES.MALFORMED, `${BINDING_HEADER} is not a ${BINDING_VERSION} binding`);
  }
  const encodedPayload = parts[1] as string;
  const presentedSignature = parts[2] as string;

  if (!equal(presentedSignature, sign(encodedPayload, key))) {
    throw new QboBindingError(BINDING_ERROR_CODES.SIGNATURE, `${BINDING_HEADER} was not signed by this deployment`);
  }

  let claims: BindingClaims;
  try {
    claims = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as BindingClaims;
  } catch {
    throw new QboBindingError(BINDING_ERROR_CODES.MALFORMED, `${BINDING_HEADER} payload is not readable`);
  }

  const claimedRealm = requiredString(claims.r, 32);
  const actorUserId = requiredString(claims.a, 64);
  const chatbotId = requiredString(claims.c, 64);
  const connectorId = requiredString(claims.k, 64);
  const fingerprint = requiredString(claims.t, 64);
  const issuedAt = typeof claims.i === "number" && Number.isSafeInteger(claims.i) ? claims.i : undefined;

  if (
    claimedRealm === undefined ||
    actorUserId === undefined ||
    chatbotId === undefined ||
    connectorId === undefined ||
    fingerprint === undefined ||
    issuedAt === undefined
  ) {
    throw new QboBindingError(BINDING_ERROR_CODES.MALFORMED, `${BINDING_HEADER} is missing required claims`);
  }

  if (issuedAt > now + MAX_FUTURE_SKEW_SECONDS || issuedAt < now - MAX_AGE_SECONDS) {
    throw new QboBindingError(
      BINDING_ERROR_CODES.EXPIRED,
      `${BINDING_HEADER} was issued outside the accepted window`,
    );
  }

  // The two checks P3.2 exists for: the path's company and the bearer must both be
  // the ones our API signed for.
  if (!equal(claimedRealm, realmId)) {
    throw new QboBindingError(
      BINDING_ERROR_CODES.REALM_MISMATCH,
      "the company in the request path is not the company this authorization was issued for",
    );
  }
  if (!equal(fingerprint, accessTokenFingerprint(accessToken))) {
    throw new QboBindingError(
      BINDING_ERROR_CODES.TOKEN_MISMATCH,
      "the presented access token is not the one this authorization was issued for",
    );
  }

  return { realmId: claimedRealm, actorUserId, chatbotId, connectorId, issuedAt };
}
