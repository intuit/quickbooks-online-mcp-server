import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const EXECUTION_ASSERTION_HEADER = "x-qbo-execution-assertion";

const VERSION = "v2";
const MAX_LENGTH = 4_096;
const MAX_LIFETIME_SECONDS = 60;
const MAX_FUTURE_SKEW_SECONDS = 5;

export const EXECUTION_ASSERTION_ERROR_CODES = {
  MISSING: "EXECUTION_ASSERTION_MISSING",
  MALFORMED: "EXECUTION_ASSERTION_MALFORMED",
  SIGNATURE: "EXECUTION_ASSERTION_SIGNATURE_INVALID",
  EXPIRED: "EXECUTION_ASSERTION_EXPIRED",
  MISMATCH: "EXECUTION_ASSERTION_REQUEST_MISMATCH",
} as const;

export type ExecutionAssertionErrorCode = (typeof EXECUTION_ASSERTION_ERROR_CODES)[keyof typeof EXECUTION_ASSERTION_ERROR_CODES];

export class QboExecutionAssertionError extends Error {
  constructor(readonly code: ExecutionAssertionErrorCode, message: string) {
    super(message);
    this.name = "QboExecutionAssertionError";
  }
}

interface Claims {
  version?: unknown;
  tenantId?: unknown;
  connectionId?: unknown;
  chatbotId?: unknown;
  connectorId?: unknown;
  actorId?: unknown;
  conversationId?: unknown;
  invocationId?: unknown;
  jti?: unknown;
  environment?: unknown;
  realmId?: unknown;
  tokenFingerprint?: unknown;
  audience?: unknown;
  configVersion?: unknown;
  issuedAt?: unknown;
  expiresAt?: unknown;
}

export interface VerifiedExecutionAssertion {
  readonly tenantId: string;
  readonly connectionId: string;
  readonly chatbotId: string;
  readonly connectorId: string;
  readonly actorId?: string;
  readonly conversationId?: string;
  readonly invocationId: string;
  readonly jti: string;
  readonly environment: "SANDBOX" | "PRODUCTION";
  readonly realmId: string;
  readonly tokenFingerprint: string;
  readonly audience: string;
  readonly configVersion: string;
  readonly issuedAt: number;
  readonly expiresAt: number;
}

export function verifyExecutionAssertion(input: {
  assertion: string | undefined;
  realmId: string;
  accessToken: string;
  environment: "sandbox" | "production";
  key: string;
  previousKey?: string;
  nowSeconds?: number;
}): VerifiedExecutionAssertion {
  if (!input.assertion) throw new QboExecutionAssertionError(EXECUTION_ASSERTION_ERROR_CODES.MISSING, `${EXECUTION_ASSERTION_HEADER} was not presented`);
  if (input.assertion.length > MAX_LENGTH) throw new QboExecutionAssertionError(EXECUTION_ASSERTION_ERROR_CODES.MALFORMED, `${EXECUTION_ASSERTION_HEADER} is implausibly long`);
  const parts = input.assertion.split(".");
  if (parts.length !== 3 || parts[0] !== VERSION) throw new QboExecutionAssertionError(EXECUTION_ASSERTION_ERROR_CODES.MALFORMED, `${EXECUTION_ASSERTION_HEADER} is not a ${VERSION} assertion`);
  const payload = parts[1] as string;
  const signature = parts[2] as string;
  const keys = [input.key, input.previousKey].filter((value): value is string => Boolean(value));
  if (!keys.some((key) => equal(signature, sign(`${VERSION}.${payload}`, key)))) throw new QboExecutionAssertionError(EXECUTION_ASSERTION_ERROR_CODES.SIGNATURE, `${EXECUTION_ASSERTION_HEADER} signature is invalid`);
  let claims: Claims;
  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as unknown;
    if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) throw new Error("not an object");
    claims = decoded as Claims;
  } catch {
    throw new QboExecutionAssertionError(EXECUTION_ASSERTION_ERROR_CODES.MALFORMED, `${EXECUTION_ASSERTION_HEADER} payload is not readable`);
  }
  const tenantId = requiredString(claims.tenantId, 64);
  const connectionId = requiredString(claims.connectionId, 64);
  const chatbotId = requiredString(claims.chatbotId, 64);
  const connectorId = requiredString(claims.connectorId, 64);
  const actorId = optionalString(claims.actorId, 64);
  const conversationId = optionalString(claims.conversationId, 64);
  const invocationId = requiredString(claims.invocationId, 128);
  const jti = requiredString(claims.jti, 128);
  const environment = claims.environment === "SANDBOX" || claims.environment === "PRODUCTION" ? claims.environment : undefined;
  const claimedRealm = requiredString(claims.realmId, 32);
  const tokenFingerprint = requiredString(claims.tokenFingerprint, 128);
  const audience = requiredString(claims.audience, 128);
  const configVersion = requiredString(claims.configVersion, 128);
  const issuedAt = safeInteger(claims.issuedAt);
  const expiresAt = safeInteger(claims.expiresAt);
  if (!tenantId || !connectionId || !chatbotId || !connectorId || !invocationId || !jti || !environment || !claimedRealm || !tokenFingerprint || !audience || !configVersion || issuedAt === undefined || expiresAt === undefined) {
    throw new QboExecutionAssertionError(EXECUTION_ASSERTION_ERROR_CODES.MALFORMED, `${EXECUTION_ASSERTION_HEADER} is missing required claims`);
  }
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1_000);
  if (issuedAt > now + MAX_FUTURE_SKEW_SECONDS || expiresAt < now || expiresAt <= issuedAt || expiresAt - issuedAt > MAX_LIFETIME_SECONDS) {
    throw new QboExecutionAssertionError(EXECUTION_ASSERTION_ERROR_CODES.EXPIRED, `${EXECUTION_ASSERTION_HEADER} is outside its accepted window`);
  }
  const expectedEnvironment = input.environment === "production" ? "PRODUCTION" : "SANDBOX";
  if (!equal(claimedRealm, input.realmId) || environment !== expectedEnvironment || !equal(tokenFingerprint, accessTokenFingerprint(input.accessToken))) {
    throw new QboExecutionAssertionError(EXECUTION_ASSERTION_ERROR_CODES.MISMATCH, "execution assertion does not match this QuickBooks request");
  }
  return { tenantId, connectionId, chatbotId, connectorId, ...(actorId ? { actorId } : {}), ...(conversationId ? { conversationId } : {}), invocationId, jti, environment, realmId: claimedRealm, tokenFingerprint, audience, configVersion, issuedAt, expiresAt };
}

function accessTokenFingerprint(accessToken: string): string {
  return createHash("sha256").update(accessToken, "utf8").digest("hex");
}

function sign(message: string, key: string): string {
  return createHmac("sha256", key).update(message, "utf8").digest("base64url");
}

function equal(left: string, right: string): boolean {
  const a = cryptoBytes(left);
  const b = cryptoBytes(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function requiredString(value: unknown, maxLength: number): string | undefined {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength ? value : undefined;
}

function optionalString(value: unknown, maxLength: number): string | undefined {
  return value === undefined ? undefined : requiredString(value, maxLength);
}

function safeInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) ? value : undefined;
}

function cryptoBytes(value: string): Uint8Array<ArrayBuffer> {
  const source = Buffer.from(value, "utf8");
  const output = new Uint8Array(new ArrayBuffer(source.length));
  for (let index = 0; index < source.length; index += 1) output[index] = source[index];
  return output;
}
