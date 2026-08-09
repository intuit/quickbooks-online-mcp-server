# Design: Co-locate simpro-mcp into intuit-qbo-mcp

## Problem

Two separate MCP servers exist for Nexus Communications Technology's stack:

- `intuit-qbo-mcp` (this repo) — 12.5k LOC, per-domain hand-written QBO tools, interactive OAuth + refresh-token rotation, full test suite, npm-published package.
- `~/Documents/NXSCT/simpro-mcp` — small (3 src files), generic CRUD passthrough for simPRO's REST API (7 tools total, parameterized by a `resource` string), no test suite.

Operators currently need two separate MCP host config entries to use both. There's also a broader goal — cross-system reconciliation tooling (jobs invoiced in simPRO but missing in QBO, payment mismatches) — that depends on both tool sets living in one process first. That reconciliation work is out of scope here; this spec only covers co-location, the foundation it needs.

## Approach

Absorb simpro-mcp into this repo rather than standing up a third repo or the reverse direction (absorbing qbo-mcp into simpro-mcp, rejected given qbo-mcp's size/maturity/test coverage). Both already use `@modelcontextprotocol/sdk` with compatible `registerTool`/`tool` APIs — no SDK version conflict blocks this.

## Repo layout & porting plan

simpro-mcp's generic 7-tool shape (`simpro_list_companies`, `simpro_list`, `simpro_get`, `simpro_create`, `simpro_update`, `simpro_delete`, `simpro_request`) is the right design for simPRO's 300+ endpoint surface — porting it doesn't fight that shape, it's still 7 files.

- `src/simpro/client.ts` — ported from `simpro-client.ts`, adapted to this repo's error-handling convention (structured `{isError, error}` returns, matching `create-quickbooks-customer.handler.ts`, not throw-and-catch-in-index).
- `src/simpro/config.ts` — ported as-is. Env vars stay `SIMPRO_*`, no collision with `QUICKBOOKS_*`.
- `src/tools/simpro-*.tool.ts` — 7 files, same `ToolDefinition` shape as existing QBO tools, registered via the existing `RegisterTool(server, ...)` call in `index.ts`.
- The original `~/Documents/NXSCT/simpro-mcp` repo is retired once ported (or left archived — outside this repo's concern).

## Auth, config, server identity

No auth merging needed — the two APIs' auth models stay fully independent, two client singletons in one process:

- QBO: existing `QuickbooksClient` (interactive OAuth + refresh-token rotation, `QUICKBOOKS_*` env vars, plus the sidecar persistence from the #117 spec).
- simPRO: confirmed live against the Nexus Communications Technology build (`nexusct.simprosuite.com`, company 0) — **API Key mode**, a static Bearer token (`Authorization: Bearer <access_token>`), no expiry/refresh cycle at all. Simpler than the OAuth2 client-credentials path originally assumed; `SIMPRO_ACCESS_TOKEN` static-token mode in the existing simpro-mcp client is the one that applies here, not the client-credentials branch.

`QuickbooksMCPServer.GetServer()` is renamed from `"QuickBooks Online MCP Server"` to `"QuickBooks + simPRO MCP Server"`, since it now serves both tool sets from one process/one client config entry.

simPRO connectivity is optional at startup — unlike QBO's env vars (which throw if `client_id`/`client_secret` missing), simPRO tools register unconditionally but fail per-call with a clear "simPRO not configured" error if `SIMPRO_BASE_URL`/credentials are absent. An operator using only the QBO side shouldn't have the server refuse to start because simPRO isn't configured.

## Tool registration & destructive-op gating

QBO tools are already gated behind `QUICKBOOKS_DISABLE_WRITE`/`UPDATE`/`DELETE` via prefix-based `getCrudCategory()` in `src/helpers/register-tool.ts`. simPRO's tool names don't fit that prefix convention, and `simpro_request` is a raw passthrough that can perform any HTTP verb — including destructive ones — through a single generic tool.

- `PREFIX_CATEGORY_MAP`/`getCrudCategory` gets exact-name entries (not prefix) for `simpro_create` → WRITE, `simpro_update` → UPDATE, `simpro_delete` → DELETE.
- New env vars mirroring the existing convention: `SIMPRO_DISABLE_WRITE`, `SIMPRO_DISABLE_UPDATE`, `SIMPRO_DISABLE_DELETE` — separate from `QUICKBOOKS_DISABLE_*` so an operator can lock down one system without the other.
- `simpro_request` is gated by inspecting the `method` argument at call time, not registration time: `POST`→WRITE, `PATCH`/`PUT`→UPDATE, `DELETE`→DELETE, `GET`→unrestricted. The same disable check runs inside the handler before dispatching, since a single tool spans all four categories depending on the call.

## Testing, build & docs

- New `tests/unit/clients/simpro-client.test.ts` — mirrors the `quickbooks-client.auth.test.ts` pattern (`jest.unstable_mockModule`). Covers static-token auth (no refresh-cycle tests needed, unlike QBO — confirmed via live verification that this build uses API Key mode), 429 retry/backoff, and error passthrough.
- New `tests/unit/tools/simpro-*.test.ts` — one per tool, same shape as existing `tests/unit/tools/*.test.ts` (schema validation, handler success/error paths, CRUD-gating via `SIMPRO_DISABLE_*`).
- `package.json` unchanged structurally — still one `bin`, one `dist/index.js`; `tsc` picks up `src/simpro/**` automatically.
- `README.md` gets a new env-var table for `SIMPRO_*` (mirroring the existing `QUICKBOOKS_*` table) and a tools table entry for the 7 simPRO tools.
- `verify-readonly.mjs` (currently untracked/local, hardcodes a QBO-only tool list) is out of scope for this spec — its list would go stale for the simPRO side if relied on; extending it is optional, operator's call.
- `CHANGELOG.md` entry per repo convention.

## Out of scope

- Cross-system reconciliation tools (job/payment mismatch detection between simPRO and QBO) — separate spec, sequenced after this one, once the merged server exists to build on.
- The token sidecar persistence work (#117) — separate spec, already written (`2026-08-08-token-sidecar-persistence-design.md`).
