import { describe, it, expect, beforeAll } from "@jest/globals";
import { readdirSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { z } from "zod";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { deepPermissiveSchema } from "../../../src/helpers/unsupported-params";
import { permissiveParamsSchema } from "../../../src/helpers/register-tool";
import type { ToolDefinition } from "../../../src/types/tool-definition";
type AnyToolDefinition = ToolDefinition<z.ZodTypeAny>;

async function loadAllTools(): Promise<AnyToolDefinition[]> {
  const toolsDir = join(import.meta.dirname, "../../../dist/tools");
  const toolDefs: AnyToolDefinition[] = [];
  for (const file of readdirSync(toolsDir).filter((f) => f.endsWith(".tool.js"))) {
    const mod = await import(pathToFileURL(join(toolsDir, file)).href);
    for (const value of Object.values(mod)) {
      if (
        value &&
        typeof value === "object" &&
        "name" in value &&
        "schema" in value &&
        "handler" in value
      ) {
        toolDefs.push(value as AnyToolDefinition);
      }
    }
  }
  return toolDefs;
}

/** Main-branch registration: top-level passthrough only. */
function mainParamsSchema<T extends z.ZodTypeAny>(schema: T): T {
  return permissiveParamsSchema(schema);
}

/** Fix-branch registration. */
function branchParamsSchema<T extends z.ZodTypeAny>(schema: T): T {
  return permissiveParamsSchema(deepPermissiveSchema(schema));
}

function stripAdditionalProperties(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map(stripAdditionalProperties);
  if (obj && typeof obj === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (k === "additionalProperties") continue;
      out[k] = stripAdditionalProperties(v);
    }
    return out;
  }
  return obj;
}

async function inputSchemaForParamsSchema(paramsSchema: z.ZodTypeAny) {
  const server = new McpServer({ name: "t", version: "0" });
  server.tool("probe", "d", { params: paramsSchema }, async () => ({
    content: [{ type: "text", text: "ok" }],
  }));
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "c", version: "0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  const list = await client.listTools();
  await client.close();
  return stripAdditionalProperties(list.tools[0]!.inputSchema);
}

function unwrapFieldSchema(schema: z.ZodTypeAny): z.ZodTypeAny {
  let current = schema;
  for (;;) {
    const t = current._def.typeName;
    if (t === "ZodOptional" || t === "ZodNullable" || t === "ZodDefault") {
      current = current._def.innerType;
      continue;
    }
    if (t === "ZodEffects") {
      current = current._def.schema;
      continue;
    }
    break;
  }
  return current;
}

function arrayMinLength(schema: z.ZodTypeAny): number | undefined {
  const inner = unwrapFieldSchema(schema);
  if (inner._def.typeName !== "ZodArray") return undefined;
  const min = (inner._def as { minLength?: { value: number } | null }).minLength;
  return min?.value;
}

function minimalValidParams(paramsSchema: z.ZodTypeAny): unknown {
  const inner = unwrapFieldSchema(paramsSchema);
  if (inner._def.typeName !== "ZodObject") return {};
  const shape =
    typeof inner._def.shape === "function" ? inner._def.shape() : inner._def.shape;
  const out: Record<string, unknown> = {};
  for (const [key, fieldSchema] of Object.entries(shape as Record<string, z.ZodTypeAny>)) {
    const field = unwrapFieldSchema(fieldSchema);
    const t = field._def.typeName;
    if (t === "ZodString") out[key] = "x";
    else if (t === "ZodNumber") out[key] = 1;
    else if (t === "ZodBoolean") out[key] = true;
    else if (t === "ZodArray") {
      const min = (field._def as { minLength?: { value: number } | null }).minLength?.value ?? 0;
      const count = Math.max(min, 1);
      const itemShape =
        typeof field._def.type._def.shape === "function"
          ? field._def.type._def.shape()
          : field._def.type._def.shape;
      const item: Record<string, unknown> = {};
      if (itemShape) {
        for (const [ik, is] of Object.entries(itemShape as Record<string, z.ZodTypeAny>)) {
          const it = unwrapFieldSchema(is);
          if (it._def.typeName === "ZodString") item[ik] = "x";
          else if (it._def.typeName === "ZodNumber") item[ik] = 1;
          else item[ik] = "x";
        }
      }
      out[key] = Array.from({ length: count }, () => ({ ...item }));
    } else if (t === "ZodObject") out[key] = {};
    else if (t === "ZodAny" || t === "ZodUnknown" || t === "ZodRecord") out[key] = {};
    else if (t === "ZodEnum") out[key] = field._def.values[0];
  }
  return out;
}

describe("deepPermissiveSchema on real tools", () => {
  beforeAll(() => {
    process.env.QUICKBOOKS_CLIENT_ID = "test-client-id";
    process.env.QUICKBOOKS_CLIENT_SECRET = "test-client-secret";
    process.env.QUICKBOOKS_REDIRECT_URI = "http://localhost/callback";
  });

  it("matches main tools/list JSON for every tool except additionalProperties", async () => {
    const toolDefs = await loadAllTools();
    expect(toolDefs.length).toBe(142);

    const mismatches: string[] = [];
    for (const def of toolDefs) {
      const mainJson = await inputSchemaForParamsSchema(mainParamsSchema(def.schema));
      const branchJson = await inputSchemaForParamsSchema(branchParamsSchema(def.schema));
      if (JSON.stringify(mainJson) !== JSON.stringify(branchJson)) {
        mismatches.push(def.name);
      }
    }
    expect(mismatches).toEqual([]);
  });

  it("rejects empty line_items on every tool whose schema uses .min(1)", async () => {
    const offenders: string[] = [];

    const checkTool = async (def: AnyToolDefinition) => {
      const shape =
        typeof def.schema._def.shape === "function"
          ? def.schema._def.shape()
          : def.schema._def.shape;
      const lineField = (shape as Record<string, z.ZodTypeAny>).line_items;
      if (!lineField) return;
      if (arrayMinLength(lineField) !== 1) return;

      const paramsSchema = branchParamsSchema(def.schema);
      const base = minimalValidParams(paramsSchema) as Record<string, unknown>;
      base.line_items = [];
      try {
        paramsSchema.parse(base);
        offenders.push(def.name);
      } catch {
        /* expected */
      }
    };

    const toolDefs = await loadAllTools();
    for (const def of toolDefs) {
      await checkTool(def);
    }
    expect(offenders).toEqual([]);
  });

  it("preserves .min(1) and descriptions on create_invoice line_items", async () => {
    const createInvoice = (await loadAllTools()).find((t) => t.name === "create_invoice");
    expect(createInvoice).toBeDefined();
    const branchSchema = branchParamsSchema(createInvoice!.schema);
    const mainSchema = mainParamsSchema(createInvoice!.schema);

    const [mainJson, branchJson] = await Promise.all([
      inputSchemaForParamsSchema(mainSchema),
      inputSchemaForParamsSchema(branchSchema),
    ]);
    expect(branchJson).toEqual(mainJson);

    const lineItems = (branchJson as any).properties.params.properties.line_items;
    expect(lineItems.minItems).toBe(1);

    expect(() =>
      branchSchema.parse({ customer_ref: "4", line_items: [] })
    ).toThrow(/at least 1 element/i);
  });
});
