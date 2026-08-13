import { createHash, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

/** Plumbing shared by the routes. No QuickBooks knowledge, no tenancy decisions. */

export function headerValue(request: IncomingMessage, name: string): string | undefined {
  const raw = request.headers[name];
  if (Array.isArray(raw)) return raw[0];
  return typeof raw === "string" && raw.length > 0 ? raw : undefined;
}

/**
 * Proves the caller is our API rather than the open internet. Digests are
 * compared so the comparison is constant-time whatever the presented length —
 * timingSafeEqual throws on a length mismatch, which would itself be an oracle.
 */
export function callerIsTrusted(request: IncomingMessage, expected: string): boolean {
  const presented = headerValue(request, "x-service-token");
  if (!presented) return false;
  const a = createHash("sha256").update(presented).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

export function bearerToken(request: IncomingMessage): string | undefined {
  const header = headerValue(request, "authorization");
  if (!header) return undefined;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? (match[1] as string).trim() : undefined;
}

export function requestId(request: IncomingMessage): string {
  const supplied = headerValue(request, "x-request-id");
  if (supplied && supplied.length <= 128) return supplied;
  return createHash("sha256")
    .update(`${process.pid}:${process.hrtime.bigint()}`)
    .digest("hex")
    .slice(0, 32);
}

/** Logs identify a company or a user without recording which one it is. */
export function fingerprint(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "unknown_error";
}

export function sendJson(response: ServerResponse, status: number, payload: Record<string, unknown>): void {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(body),
  });
  response.end(body);
}
