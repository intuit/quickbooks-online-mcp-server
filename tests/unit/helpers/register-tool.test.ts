import { describe, it, expect, afterEach, jest } from "@jest/globals";
import {
  getCrudCategory,
  isToolDisabled,
  knownParamKeys,
  permissiveParamsSchema,
  RegisterTool,
  unsupportedParamsWarning,
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
  it("returns WRITE for send_ prefix",    () => expect(getCrudCategory("send_invoice")).toBe("WRITE"));
  it("returns WRITE for send- prefix",    () => expect(getCrudCategory("send-estimate")).toBe("WRITE"));
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
  it("returns true for send_ tool when QUICKBOOKS_DISABLE_WRITE=true",        () => { process.env["QUICKBOOKS_DISABLE_WRITE"]  = "true"; expect(isToolDisabled("send_invoice")).toBe(true); });
  it("returns false for send_ tool when QUICKBOOKS_DISABLE_WRITE unset",       () => expect(isToolDisabled("send_invoice")).toBe(false));

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
    const [name, description, shape, handler] = (server.tool as jest.Mock).mock.calls[0] as any[];
    expect(name).toBe(d.name);
    expect(description).toBe(d.description);
    expect(typeof handler).toBe("function");
    // The registered schema is the definition's schema made permissive, so an
    // unsupported parameter survives validation and can be reported instead of
    // silently vanishing. It is therefore not the same object identity.
    expect((shape.params as any).parse({ id: "1", unexpected_key: 1 }).unexpected_key).toBe(1);
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


// ── unsupported parameters ───────────────────────────────────────────────────
// A tool schema is a strict zod object, so an undeclared parameter is dropped
// during validation and the caller is never told. These cover both halves of
// the fix: naming the parameter, and still not forwarding it to QuickBooks.
describe("unsupported parameter reporting", () => {
  const runRegistered = async (toolName: string, schema: any, params: any) => {
    const seen: any[] = [];
    const handler = jest.fn(async (args: any) => {
      seen.push(args);
      return { content: [{ type: "text", text: "ok" }] };
    });
    const server = { tool: jest.fn() } as unknown as McpServer;
    RegisterTool(server, { name: toolName, description: "d", schema, handler } as any);
    const registered = (server.tool as jest.Mock).mock.calls[0][3] as any;
    const result = await registered({ params });
    return { result, seenByHandler: seen[0]?.params };
  };

  it("names an unsupported parameter in the response", async () => {
    const { result } = await runRegistered(
      "create_invoice",
      z.object({ customer_ref: z.string() }),
      { customer_ref: "1", ship_date: "2026-09-01" }
    );
    expect(result.content[0].text).toContain("create_invoice does not support");
    expect(result.content[0].text).toContain("ship_date");
    expect(result.content[0].text).toContain("customer_ref"); // lists what IS supported
    expect(result.content[1].text).toBe("ok"); // original response preserved
  });

  it("strips unknown keys so they cannot reach QuickBooks", async () => {
    // search-bills/customers/estimates/vendors spread leftover params into query
    // criteria; a key left in place would become a real SQL filter.
    const { seenByHandler } = await runRegistered(
      "search_bills",
      z.object({ criteria: z.any().optional() }),
      { criteria: [], DocNumber: "1042" }
    );
    expect(seenByHandler).toEqual({ criteria: [] });
    expect(seenByHandler).not.toHaveProperty("DocNumber");
  });

  it("leaves a fully supported call untouched", async () => {
    const { result, seenByHandler } = await runRegistered(
      "read_invoice",
      z.object({ invoice_id: z.string() }),
      { invoice_id: "42" }
    );
    expect(seenByHandler).toEqual({ invoice_id: "42" });
    expect(result.content[0].text).toBe("ok");
  });

  it("pluralises, and stays silent on input it cannot analyse", () => {
    const known = knownParamKeys(z.object({ a: z.string() }));
    expect(unsupportedParamsWarning("t", known, { b: 1, c: 2 })).toContain("these parameters");
    expect(unsupportedParamsWarning("t", known, { a: "x" })).toBeNull();
    expect(unsupportedParamsWarning("t", known, undefined)).toBeNull();
    expect(unsupportedParamsWarning("t", null, { b: 1 })).toBeNull();
  });

  it("knownParamKeys returns null for schemas without an object shape", () => {
    expect(knownParamKeys(z.string())).toBeNull();
    expect(knownParamKeys(undefined)).toBeNull();
  });

  it("knownParamKeys reads shape provided as a plain object (zod v4 style)", () => {
    const objectShapeSchema = { _def: { shape: { a: true, b: true } } };
    expect(knownParamKeys(objectShapeSchema)).toEqual(new Set(["a", "b"]));
  });

  it("knownParamKeys returns null when reading the shape throws", () => {
    const throwingSchema = {
      _def: {
        shape: () => {
          throw new Error("broken shape");
        },
      },
    };
    expect(knownParamKeys(throwingSchema)).toBeNull();
  });

  it("permissiveParamsSchema keeps unknown keys and passes non-object schemas through", () => {
    const permissive: any = permissiveParamsSchema(z.object({ a: z.string() }));
    expect(permissive.parse({ a: "x", extra: 1 }).extra).toBe(1);
    const plain = z.string();
    expect(permissiveParamsSchema(plain)).toBe(plain);
  });
});
