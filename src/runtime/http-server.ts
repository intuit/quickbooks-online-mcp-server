import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { referenceCacheStats } from "./cache/reference-cache.js";
import type { ServiceConfig } from "./config.js";
import {
  bearerToken,
  callerIsTrusted,
  errorMessage,
  headerValue,
  fingerprint,
  requestId,
  sendJson,
} from "./http-helpers.js";
import { log } from "./logger.js";
import { pdfHandleStats } from "./pdf-handles.js";
import { PDF_PATH_PATTERN, servePdf } from "./pdf-route.js";
import { forgetRequestReads, readsForRequest, transportStats } from "./qbo-transport.js";
import { BINDING_HEADER, QboBindingError, verifyTenantBinding } from "./tenant-binding.js";
import { EXECUTION_ASSERTION_HEADER, QboExecutionAssertionError, verifyExecutionAssertion } from "./execution-assertion.js";
import { ExecutionReplayStore } from "./execution-replay.js";
import { assertTenant, QboTenantError, runInTenantScope, tenantOrNull, type QboTenant } from "./tenant-context.js";
import { ALLOWLISTED_TOOLS, assertAllowlistIntegrity } from "./tool-allowlist.js";
import { configureAppLinks } from "./app-links.js";

/**
 * Streamable HTTP front door.
 *
 * Every request builds its own MCP server and its own tenant scope, then throws
 * both away. Nothing is cached across requests: the tenant's token can rotate at
 * any time and any reuse would risk serving one company's data to another. That
 * is why this runs the transport in stateless mode rather than keeping sessions.
 */

/** POST /v1/mcp/{realmId} — realmId travels in the path, as the catalog's urlTemplate expects. */
const MCP_PATH_PATTERN = /^\/v1\/mcp\/([^/?#]+)$/;
const HEALTH_PATH = "/health";
const executionReplayStore = new ExecutionReplayStore();

export function createHttpServer(config: ServiceConfig): Server {
  assertAllowlistIntegrity();
  // Configured here rather than at the entry point so every way of starting this service —
  // main, the regression harness, a future embedding — links to the same environment the
  // tokens belong to. Set once from config, never from a request.
  configureAppLinks(config.environment);

  return createServer((request, response) => {
    void route(request, response, config).catch((error: unknown) => {
      // Last-resort guard: a throw here would take the process down.
      log.error("request_failed_unexpectedly", { message: errorMessage(error) });
      if (!response.headersSent) sendJson(response, 500, { error: "internal_error" });
      else response.destroy();
    });
  });
}

async function route(request: IncomingMessage, response: ServerResponse, config: ServiceConfig): Promise<void> {
  const url = new URL(request.url ?? "/", "http://localhost");

  if (request.method === "GET" && url.pathname === HEALTH_PATH) {
    sendJson(response, 200, {
      status: "ok",
      version: config.version,
      environment: config.environment,
      // Counters only: how many entries and bytes are held, never whose.
      caches: { reference: referenceCacheStats(), pdfHandles: pdfHandleStats() },
      quickbooks: transportStats(),
    });
    return;
  }

  const pdfMatch = PDF_PATH_PATTERN.exec(url.pathname);
  if (pdfMatch) {
    servePdf({
      request,
      response,
      config,
      realmId: pdfMatch[1] as string,
      handle: pdfMatch[2] as string,
    });
    return;
  }

  const match = MCP_PATH_PATTERN.exec(url.pathname);
  if (!match) {
    sendJson(response, 404, { error: "not_found" });
    return;
  }
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    sendJson(response, 405, { error: "method_not_allowed" });
    return;
  }

  if (!callerIsTrusted(request, config.serviceToken)) {
    // Same response whether the header is absent or wrong: no oracle.
    sendJson(response, 401, { error: "unauthorized" });
    return;
  }

  let tenant: QboTenant;
  try {
    tenant = resolveTenant(request, config, decodeURIComponent(match[1] as string));
  } catch (error) {
    if (error instanceof QboBindingError) {
      // 403, not 400: the request is well-formed but this caller is not authorized
      // for this pairing. A distinct code per reason, so a mismatched realm is never
      // mistaken for an expired grant.
      log.warn("tenant_binding_rejected", { code: error.code });
      sendJson(response, 403, { error: error.code, message: error.message });
      return;
    }
    if (error instanceof QboTenantError) {
      sendJson(response, 400, { error: error.code, message: error.message });
      return;
    }
    if (error instanceof QboExecutionAssertionError) {
      log.warn("execution_assertion_rejected", { code: error.code });
      sendJson(response, 403, { error: error.code, message: error.message });
      return;
    }
    throw error;
  }

  let body: unknown;
  try {
    body = await readJsonBody(request, config.maxRequestBytes);
  } catch (error) {
    sendJson(response, errorMessage(error) === "payload_too_large" ? 413 : 400, {
      error: errorMessage(error),
    });
    return;
  }

  const replayKey = tenant.tenantId && tenant.executionAssertionJti
    ? `${tenant.tenantId}:${tenant.executionAssertionJti}`
    : tenant.executionAssertionJti;
  if (replayKey && isToolCall(body) && !executionReplayStore.claim(replayKey)) {
    sendJson(response, 409, { error: "EXECUTION_ASSERTION_REPLAYED" });
    return;
  }

  await handleMcpRequest({ request, response, config, tenant, body });
}

/**
 * Turns the request into a tenant, refusing to guess.
 *
 * The realm comes from the path and the token from the bearer, which are two
 * independent assertions; the binding is what says our API paired them, for a named
 * user, moments ago. Verification happens before the tenant exists, so a rejected
 * binding means no QuickBooks call was even prepared.
 */
function resolveTenant(request: IncomingMessage, config: ServiceConfig, pathRealmId: string): QboTenant {
  const accessToken = bearerToken(request);

  // Shape-check the token first so the fingerprint is computed over something
  // plausible, and so an absent bearer reads as a tenant problem, not a forgery.
  const tenant = assertTenant({
    realmId: pathRealmId,
    accessToken,
    environment: config.environment,
    requestId: requestId(request),
  });

  const assertionHeader = headerValue(request, EXECUTION_ASSERTION_HEADER);
  if (assertionHeader !== undefined) {
    if (!config.executionAssertionKey) throw new QboExecutionAssertionError("EXECUTION_ASSERTION_MISSING", "execution assertion verification is not configured");
    const verified = verifyExecutionAssertion({
      assertion: assertionHeader,
      realmId: tenant.realmId,
      accessToken: tenant.accessToken,
      environment: config.environment,
      key: config.executionAssertionKey,
      previousKey: config.previousExecutionAssertionKey,
    });
    return { ...tenant, tenantId: verified.tenantId, connectionId: verified.connectionId, actorUserId: verified.actorId, chatbotId: verified.chatbotId, connectorId: verified.connectorId, invocationId: verified.invocationId, executionAssertionJti: verified.jti };
  }

  if (config.requireExecutionAssertion) {
    throw new QboExecutionAssertionError("EXECUTION_ASSERTION_MISSING", `${EXECUTION_ASSERTION_HEADER} was not presented`);
  }

  if (config.bindingKey === undefined) {
    // Local development only; loadConfig refuses this against production.
    return tenant;
  }

  const verified = verifyTenantBinding({
    binding: headerValue(request, BINDING_HEADER),
    realmId: tenant.realmId,
    accessToken: tenant.accessToken,
    key: config.bindingKey,
  });

  return { ...tenant, actorUserId: verified.actorUserId, chatbotId: verified.chatbotId, connectorId: verified.connectorId };
}

function isToolCall(body: unknown): boolean {
  if (!body || typeof body !== "object") return false;
  if (Array.isArray(body)) return body.some((item) => isToolCall(item));
  return (body as { method?: unknown }).method === "tools/call";
}

async function handleMcpRequest(input: {
  request: IncomingMessage;
  response: ServerResponse;
  config: ServiceConfig;
  tenant: QboTenant;
  body: unknown;
}): Promise<void> {
  const { request, response, config, tenant, body } = input;
  const startedAt = process.hrtime.bigint();

  const server = new McpServer(
    { name: "QuickBooks Online MCP Server", version: config.version },
    { capabilities: { tools: {} } },
  );
  registerAllowlistedTools(server, config.requestTimeoutMs);

  // Stateless: no session id, so no cross-request state can accumulate.
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

  try {
    await server.connect(transport);
    await runInTenantScope(tenant, () => transport.handleRequest(request, response, body));
    log.info("mcp_request_completed", {
      requestId: tenant.requestId,
      realm: fingerprint(tenant.realmId),
      // Attributable without being identifying: enough to tie a write to one actor
      // across log lines, not enough to name them.
      actor: tenant.actorUserId === undefined ? "unbound" : fingerprint(tenant.actorUserId),
      // What this one tool call cost against the metered read allowance.
      meteredReads: readsForRequest(tenant.requestId),
      durationMs: elapsedMs(startedAt),
    });
  } finally {
    // Order matters: closing the transport first stops it writing to a closed server.
    await transport.close().catch(() => undefined);
    await server.close().catch(() => undefined);
    // The per-request read tally is bookkeeping for this request alone; leaving it
    // behind would grow without bound.
    forgetRequestReads(tenant.requestId);
  }
}

/**
 * Registers the allowlisted tools, wrapping each handler in a hard timeout.
 * node-quickbooks issues its HTTP calls with no timeout of its own, so without
 * this a stalled QuickBooks socket would hold the request open indefinitely.
 */
function registerAllowlistedTools(server: McpServer, timeoutMs: number): void {
  for (const { definition, risk } of ALLOWLISTED_TOOLS) {
    // The vendored handlers are typed against their own schemas; the registration
    // call only needs the handler passed through unchanged, so the parameter types
    // are intentionally opaque here.
    const handler = definition.handler as (...args: never[]) => Promise<unknown>;
    // Each tool's own fields are published as the tool's arguments, rather than nested under a
    // single "params" property. Nesting cost two levels of JSON Schema depth and, more importantly,
    // made every call depend on a caller remembering the wrapper: a client that sent
    // {"invoice_id": ...} — the shape the schema reads like — had its arguments rejected as
    // unknown, so the tool looked broken rather than misaddressed. The handlers still receive
    // { params }, so only this boundary changes.
    const publishedShape = (definition.schema as unknown as { shape: Record<string, unknown> }).shape;
    server.tool(
      definition.name,
      definition.description,
      publishedShape as never,
      (async (params: unknown, extra: unknown) => {
        const tenant = tenantOrNull();
        const readsBefore = tenant === null ? 0 : readsForRequest(tenant.requestId);
        const result = await withTimeout(
          () => handler(...([{ params }, extra] as unknown as never[])),
          timeoutMs,
          definition.name,
        );
        const readsAfter = tenant === null ? 0 : readsForRequest(tenant.requestId);
        return withCallMetadata(result, {
          risk,
          meteredReads: readsAfter - readsBefore,
        });
      }) as typeof definition.handler,
    );
  }
}

/**
 * Attaches what the call actually cost, and how risky it is, to the result's `_meta`.
 *
 * The calling API needs both and can derive neither. Reads are the metered half of
 * Intuit's pricing, and a single tool call can make several — resolving a customer,
 * then an item, then the invoice — so a per-call count is the only honest input to a
 * read budget. Guessing from the tool name would undercount exactly the calls that
 * cost the most.
 *
 * `_meta` because it is the protocol's channel for host-facing metadata: a model never
 * needs to see this, and putting it in the content would spend context on bookkeeping.
 */
function withCallMetadata(result: unknown, meta: { risk: string; meteredReads: number }): unknown {
  if (typeof result !== "object" || result === null) return result;
  const existing = (result as { _meta?: Record<string, unknown> })._meta;
  return {
    ...(result as Record<string, unknown>),
    _meta: {
      ...existing,
      // Namespaced, as the protocol asks, so these cannot collide with another
      // extension's keys.
      "com.paloaltoinnovationlabs.qbo/metered-reads": meta.meteredReads,
      "com.paloaltoinnovationlabs.qbo/risk": meta.risk,
    },
  };
}

async function withTimeout<T>(operation: () => Promise<T>, timeoutMs: number, toolName: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      operation(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error(`Tool ${toolName} exceeded ${timeoutMs}ms and was abandoned`)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function readJsonBody(request: IncomingMessage, maxBytes: number): Promise<unknown> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    const buffer = chunk as Buffer;
    total += buffer.length;
    if (total > maxBytes) {
      request.destroy();
      throw new Error("payload_too_large");
    }
    chunks.push(buffer);
  }
  if (total === 0) throw new Error("empty_body");
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    throw new Error("malformed_json");
  }
}

function elapsedMs(startedAt: bigint): number {
  return Number((process.hrtime.bigint() - startedAt) / 1_000_000n);
}
