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

describe("isToolDisabled", () => {
  afterEach(() => {
    delete process.env["DISABLE_WRITE"];
    delete process.env["DISABLE_UPDATE"];
    delete process.env["DISABLE_DELETE"];
  });

  it("returns false for READ tool with no env vars set", () =>
    expect(isToolDisabled("get_invoice")).toBe(false));

  it("returns false for READ tool even when all DISABLE vars are true", () => {
    process.env["DISABLE_WRITE"]  = "true";
    process.env["DISABLE_UPDATE"] = "true";
    process.env["DISABLE_DELETE"] = "true";
    expect(isToolDisabled("search_customers")).toBe(false);
  });

  it("returns true for WRITE tool when DISABLE_WRITE=true",        () => { process.env["DISABLE_WRITE"]  = "true"; expect(isToolDisabled("create_invoice")).toBe(true); });
  it("returns false for WRITE tool when DISABLE_WRITE unset",       () => expect(isToolDisabled("create_invoice")).toBe(false));
  it("returns true for hyphen WRITE tool when DISABLE_WRITE=true",  () => { process.env["DISABLE_WRITE"]  = "true"; expect(isToolDisabled("create-bill")).toBe(true); });

  it("returns true for UPDATE tool when DISABLE_UPDATE=true",       () => { process.env["DISABLE_UPDATE"] = "true"; expect(isToolDisabled("update_customer")).toBe(true); });
  it("returns false for UPDATE tool when DISABLE_UPDATE unset",      () => expect(isToolDisabled("update_customer")).toBe(false));
  it("returns true for hyphen UPDATE tool when DISABLE_UPDATE=true", () => { process.env["DISABLE_UPDATE"] = "true"; expect(isToolDisabled("update-vendor")).toBe(true); });

  it("returns true for DELETE tool when DISABLE_DELETE=true",       () => { process.env["DISABLE_DELETE"] = "true"; expect(isToolDisabled("delete_payment")).toBe(true); });
  it("returns false for DELETE tool when DISABLE_DELETE unset",      () => expect(isToolDisabled("delete_payment")).toBe(false));
  it("returns true for hyphen DELETE tool when DISABLE_DELETE=true", () => { process.env["DISABLE_DELETE"] = "true"; expect(isToolDisabled("delete-bill")).toBe(true); });

  it('returns false when env var is "false"', () => { process.env["DISABLE_WRITE"] = "false"; expect(isToolDisabled("create_invoice")).toBe(false); });
  it('returns false when env var is "1"',     () => { process.env["DISABLE_WRITE"] = "1";     expect(isToolDisabled("create_invoice")).toBe(false); });
});

// ── RegisterTool ─────────────────────────────────────────────────────────────

describe("RegisterTool", () => {
  afterEach(() => {
    delete process.env["DISABLE_WRITE"];
    delete process.env["DISABLE_UPDATE"];
    delete process.env["DISABLE_DELETE"];
  });

  const schema = z.object({ id: z.string() });
  const handler = jest.fn() as ToolDefinition<typeof schema>["handler"];
  const def = (name: string): ToolDefinition<typeof schema> =>
    ({ name, description: `desc:${name}`, schema, handler });

  it("calls server.tool() with all definition fields when enabled", () => {
    const server = { tool: jest.fn() } as unknown as McpServer;
    const d = def("get_invoice");
    RegisterTool(server, d);
    expect(server.tool).toHaveBeenCalledTimes(1);
    expect(server.tool).toHaveBeenCalledWith(d.name, d.description, { params: d.schema }, d.handler);
  });

  it("skips server.tool() for disabled WRITE tool", () => {
    process.env["DISABLE_WRITE"] = "true";
    const server = { tool: jest.fn() } as unknown as McpServer;
    RegisterTool(server, def("create_invoice"));
    expect(server.tool).not.toHaveBeenCalled();
  });

  it("skips server.tool() for disabled UPDATE tool", () => {
    process.env["DISABLE_UPDATE"] = "true";
    const server = { tool: jest.fn() } as unknown as McpServer;
    RegisterTool(server, def("update_customer"));
    expect(server.tool).not.toHaveBeenCalled();
  });

  it("skips server.tool() for disabled DELETE tool", () => {
    process.env["DISABLE_DELETE"] = "true";
    const server = { tool: jest.fn() } as unknown as McpServer;
    RegisterTool(server, def("delete_payment"));
    expect(server.tool).not.toHaveBeenCalled();
  });

  it("registers READ tool even when all DISABLE vars are true", () => {
    process.env["DISABLE_WRITE"]  = "true";
    process.env["DISABLE_UPDATE"] = "true";
    process.env["DISABLE_DELETE"] = "true";
    const server = { tool: jest.fn() } as unknown as McpServer;
    RegisterTool(server, def("search_invoices"));
    expect(server.tool).toHaveBeenCalledTimes(1);
  });

  it("skips hyphen-prefixed WRITE tool when DISABLE_WRITE=true", () => {
    process.env["DISABLE_WRITE"] = "true";
    const server = { tool: jest.fn() } as unknown as McpServer;
    RegisterTool(server, def("create-bill"));
    expect(server.tool).not.toHaveBeenCalled();
  });
});
