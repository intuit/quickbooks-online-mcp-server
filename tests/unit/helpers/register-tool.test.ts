import { describe, it, expect, afterEach, jest } from "@jest/globals";
import {
  getCrudCategory,
  isToolDisabled,
  RegisterTool,
} from "../../../src/helpers/register-tool";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ToolDefinition } from "../../../src/types/tool-definition";

// ── getCrudCategory ──────────────────────────────────────────────────────────
// Verifies that every verb prefix maps to the correct CRUD category string.
// Uses literal expected values (not re-exported constants) so the test catches
// both a wrong mapping AND a wrong constant value simultaneously.
// Covers both underscore (standard) and hyphen (legacy) separator variants.

describe("getCrudCategory", () => {
  it("returns WRITE for create_ prefix",  () => expect(getCrudCategory("create_invoice")).toBe("WRITE"));
  it("returns WRITE for create- prefix",  () => expect(getCrudCategory("create-bill")).toBe("WRITE"));
  it("returns UPDATE for update_ prefix", () => expect(getCrudCategory("update_customer")).toBe("UPDATE"));
  it("returns UPDATE for update- prefix", () => expect(getCrudCategory("update-vendor")).toBe("UPDATE"));
  it("returns DELETE for delete_ prefix", () => expect(getCrudCategory("delete_payment")).toBe("DELETE"));
  it("returns DELETE for delete- prefix", () => expect(getCrudCategory("delete-bill")).toBe("DELETE"));
  it("returns READ for get_ prefix",      () => expect(getCrudCategory("get_invoice")).toBe("READ"));
  it("returns READ for get- prefix",      () => expect(getCrudCategory("get-vendor")).toBe("READ"));
  it("returns READ for search_ prefix",   () => expect(getCrudCategory("search_customers")).toBe("READ"));
  it("returns READ for read_ prefix",     () => expect(getCrudCategory("read_invoice")).toBe("READ"));
});

// ── isToolDisabled ───────────────────────────────────────────────────────────
// Verifies that the correct env var name gates each CRUD category.
// Uses literal env var names ("QUICKBOOKS_DISABLE_WRITE" etc.) so the test catches any
// mismatch between the documented env var and what the implementation reads.
// afterEach deletes all three vars to prevent state leaking between tests.

describe("isToolDisabled", () => {
  afterEach(() => {
    delete process.env["QUICKBOOKS_DISABLE_WRITE"];
    delete process.env["QUICKBOOKS_DISABLE_UPDATE"];
    delete process.env["QUICKBOOKS_DISABLE_DELETE"];
  });

  // READ tools must never be suppressed regardless of env state.
  it("returns false for READ tool with no env vars set", () =>
    expect(isToolDisabled("get_invoice")).toBe(false));

  it("returns false for READ tool even when all DISABLE vars are true", () => {
    process.env["QUICKBOOKS_DISABLE_WRITE"]  = "true";
    process.env["QUICKBOOKS_DISABLE_UPDATE"] = "true";
    process.env["QUICKBOOKS_DISABLE_DELETE"] = "true";
    expect(isToolDisabled("search_customers")).toBe(false);
  });

  // WRITE — underscore and hyphen variants, both enabled and disabled states.
  it("returns true for WRITE tool when QUICKBOOKS_DISABLE_WRITE=true",        () => { process.env["QUICKBOOKS_DISABLE_WRITE"]  = "true"; expect(isToolDisabled("create_invoice")).toBe(true); });
  it("returns false for WRITE tool when QUICKBOOKS_DISABLE_WRITE unset",       () => expect(isToolDisabled("create_invoice")).toBe(false));
  it("returns true for hyphen WRITE tool when QUICKBOOKS_DISABLE_WRITE=true",  () => { process.env["QUICKBOOKS_DISABLE_WRITE"]  = "true"; expect(isToolDisabled("create-bill")).toBe(true); });

  // UPDATE — underscore and hyphen variants, both enabled and disabled states.
  it("returns true for UPDATE tool when QUICKBOOKS_DISABLE_UPDATE=true",       () => { process.env["QUICKBOOKS_DISABLE_UPDATE"] = "true"; expect(isToolDisabled("update_customer")).toBe(true); });
  it("returns false for UPDATE tool when QUICKBOOKS_DISABLE_UPDATE unset",      () => expect(isToolDisabled("update_customer")).toBe(false));
  it("returns true for hyphen UPDATE tool when QUICKBOOKS_DISABLE_UPDATE=true", () => { process.env["QUICKBOOKS_DISABLE_UPDATE"] = "true"; expect(isToolDisabled("update-vendor")).toBe(true); });

  // DELETE — underscore and hyphen variants, both enabled and disabled states.
  it("returns true for DELETE tool when QUICKBOOKS_DISABLE_DELETE=true",       () => { process.env["QUICKBOOKS_DISABLE_DELETE"] = "true"; expect(isToolDisabled("delete_payment")).toBe(true); });
  it("returns false for DELETE tool when QUICKBOOKS_DISABLE_DELETE unset",      () => expect(isToolDisabled("delete_payment")).toBe(false));
  it("returns true for hyphen DELETE tool when QUICKBOOKS_DISABLE_DELETE=true", () => { process.env["QUICKBOOKS_DISABLE_DELETE"] = "true"; expect(isToolDisabled("delete-bill")).toBe(true); });

  // Boundary: only the exact string "true" disables a tool; other truthy-ish values must not.
  it('returns false when env var is "false"', () => { process.env["QUICKBOOKS_DISABLE_WRITE"] = "false"; expect(isToolDisabled("create_invoice")).toBe(false); });
  it('returns false when env var is "1"',     () => { process.env["QUICKBOOKS_DISABLE_WRITE"] = "1";     expect(isToolDisabled("create_invoice")).toBe(false); });
});

// ── RegisterTool ─────────────────────────────────────────────────────────────
// Verifies the integration between isToolDisabled and server.tool():
//   - Enabled tools are registered with the exact fields from ToolDefinition.
//   - Disabled tools cause RegisterTool to return early without calling server.tool().
// Uses a minimal mock server object to avoid coupling to the MCP SDK internals.

describe("RegisterTool", () => {
  afterEach(() => {
    delete process.env["QUICKBOOKS_DISABLE_WRITE"];
    delete process.env["QUICKBOOKS_DISABLE_UPDATE"];
    delete process.env["QUICKBOOKS_DISABLE_DELETE"];
  });

  const schema = z.object({ id: z.string() });
  const handler = jest.fn() as ToolDefinition<typeof schema>["handler"];
  const def = (name: string): ToolDefinition<typeof schema> =>
    ({ name, description: `desc:${name}`, schema, handler });

  // Confirm all four ToolDefinition fields are forwarded to server.tool() unchanged.
  it("calls server.tool() with all definition fields when enabled", () => {
    const server = { tool: jest.fn() } as unknown as McpServer;
    const d = def("get_invoice");
    RegisterTool(server, d);
    expect(server.tool).toHaveBeenCalledTimes(1);
    expect(server.tool).toHaveBeenCalledWith(d.name, d.description, { params: d.schema }, d.handler);
  });

  // One test per mutable category to confirm the early-return path is reached.
  it("skips server.tool() for disabled WRITE tool", () => {
    process.env["QUICKBOOKS_DISABLE_WRITE"] = "true";
    const server = { tool: jest.fn() } as unknown as McpServer;
    RegisterTool(server, def("create_invoice"));
    expect(server.tool).not.toHaveBeenCalled();
  });

  it("skips server.tool() for disabled UPDATE tool", () => {
    process.env["QUICKBOOKS_DISABLE_UPDATE"] = "true";
    const server = { tool: jest.fn() } as unknown as McpServer;
    RegisterTool(server, def("update_customer"));
    expect(server.tool).not.toHaveBeenCalled();
  });

  it("skips server.tool() for disabled DELETE tool", () => {
    process.env["QUICKBOOKS_DISABLE_DELETE"] = "true";
    const server = { tool: jest.fn() } as unknown as McpServer;
    RegisterTool(server, def("delete_payment"));
    expect(server.tool).not.toHaveBeenCalled();
  });

  // READ tools must register even when all three DISABLE vars are set.
  it("registers READ tool even when all DISABLE vars are true", () => {
    process.env["QUICKBOOKS_DISABLE_WRITE"]  = "true";
    process.env["QUICKBOOKS_DISABLE_UPDATE"] = "true";
    process.env["QUICKBOOKS_DISABLE_DELETE"] = "true";
    const server = { tool: jest.fn() } as unknown as McpServer;
    RegisterTool(server, def("search_invoices"));
    expect(server.tool).toHaveBeenCalledTimes(1);
  });

  // Confirm the legacy hyphen separator is handled by the early-return path.
  it("skips hyphen-prefixed WRITE tool when QUICKBOOKS_DISABLE_WRITE=true", () => {
    process.env["QUICKBOOKS_DISABLE_WRITE"] = "true";
    const server = { tool: jest.fn() } as unknown as McpServer;
    RegisterTool(server, def("create-bill"));
    expect(server.tool).not.toHaveBeenCalled();
  });
});
