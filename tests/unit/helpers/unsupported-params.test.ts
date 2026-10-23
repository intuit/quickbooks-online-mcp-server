import { describe, it, expect } from "@jest/globals";
import { z } from "zod";
import {
  collectAndStrip,
  deepPermissiveSchema,
  isPassthroughObject,
  nestedUnsupportedWarning,
  unsupportedParamsWarning,
} from "../../../src/helpers/unsupported-params";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

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

describe("collectAndStrip", () => {
  it("reads object shapes provided as plain objects", () => {
    const fake = {
      _def: {
        typeName: "ZodObject",
        unknownKeys: "strip",
        shape: { a: z.string() },
      },
    } as unknown as z.ZodTypeAny;
    const { cleaned, extras } = collectAndStrip(fake, { a: "x", b: 1 });
    expect(extras).toEqual(["b"]);
    expect(cleaned).toEqual({ a: "x" });
  });

  it("returns values unchanged when an object shape cannot be read", () => {
    const fake = {
      _def: { typeName: "ZodObject", unknownKeys: "strip" },
    } as unknown as z.ZodTypeAny;
    const input = { a: 1 };
    expect(collectAndStrip(fake, input).cleaned).toEqual(input);
  });

  it("strips unknown keys in a nested object", () => {
    const schema = z.object({ a: z.object({ b: z.string() }) });
    const { cleaned, extras } = collectAndStrip(schema, { a: { b: "v", x: 1 } });
    expect(extras).toEqual(["a.x"]);
    expect(cleaned).toEqual({ a: { b: "v" } });
  });

  it("strips unknown keys in array items and keeps declared values", () => {
    const line = z.object({
      item_ref: z.string(),
      qty: z.number(),
      flag: z.boolean(),
      note: z.string(),
    });
    const schema = z.object({ line_items: z.array(line) });
    const input = {
      line_items: [
        { item_ref: "1", qty: 0, flag: false, note: "", x: 1 },
        { item_ref: "2", qty: 1, flag: true, note: "n", y: 2 },
      ],
    };
    const { cleaned, extras } = collectAndStrip(schema, input);
    expect(extras).toEqual(["line_items[0].x", "line_items[1].y"]);
    expect(cleaned).toEqual({
      line_items: [
        { item_ref: "1", qty: 0, flag: false, note: "" },
        { item_ref: "2", qty: 1, flag: true, note: "n" },
      ],
    });
  });

  it("handles optional, nullable, and default wrappers without throwing on null/undefined", () => {
    const inner = z.object({ a: z.string().optional() });
    const schema = z.object({
      opt: inner.optional(),
      nul: z.nullable(inner),
      def: inner.default({ a: "d" }),
      arr: z.array(inner).optional(),
    });
    expect(collectAndStrip(schema, { opt: undefined, nul: null, arr: undefined }).cleaned).toEqual({
      opt: undefined,
      nul: null,
      arr: undefined,
    });
    expect(collectAndStrip(schema, { opt: null, nul: undefined }).cleaned).toEqual({
      opt: null,
      nul: undefined,
    });
  });

  it("reports extras inside ZodEffects and still validates via superRefine", () => {
    const line = z
      .object({ amount: z.number(), billable_status: z.enum(["Billable", "NotBillable"]).optional() })
      .superRefine((l, ctx) => {
        if (l.billable_status === "Billable") {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: "need customer", path: ["customer_ref"] });
        }
      });
    const schema = z.object({ line_items: z.array(line) });
    const { extras } = collectAndStrip(schema, {
      line_items: [{ amount: 1, billable_status: "Billable", zzz: "x" }],
    });
    expect(extras).toEqual(["line_items[0].zzz"]);
    expect(() =>
      deepPermissiveSchema(schema).parse({
        line_items: [{ amount: 1, billable_status: "Billable", zzz: "x" }],
      })
    ).toThrow(/customer/);
  });

  it("leaves a nested passthrough object subtree intact", () => {
    const schema = z.object({
      wrap: z.object({ a: z.string() }).passthrough(),
    });
    const input = { wrap: { a: "x", extra: "y" } };
    const { cleaned, extras } = collectAndStrip(schema, input);
    expect(extras).toEqual([]);
    expect(cleaned).toEqual(input);
  });

  it("leaves passthrough object subtrees intact", () => {
    const line = z
      .object({
        Amount: z.number(),
        DetailType: z.string(),
        JournalEntryLineDetail: z.object({ PostingType: z.string() }).passthrough(),
      })
      .passthrough();
    const schema = z.object({ journalEntry: z.object({ Line: z.array(line) }).passthrough() }).passthrough();
    expect(isPassthroughObject(schema)).toBe(true);
    const input = {
      journalEntry: {
        Adjustment: true,
        Line: [{ Amount: 1, DetailType: "JournalEntryLineDetail", Entity: { value: "1" }, Extra: true }],
      },
    };
    const { cleaned, extras } = collectAndStrip(schema, input);
    expect(extras).toEqual([]);
    expect(cleaned).toEqual(input);
  });

  it("does not walk z.any(), z.unknown(), or z.record() subtrees", () => {
    const schema = z.object({
      patch: z.record(z.any()),
      raw: z.any(),
      loose: z.unknown(),
    });
    const input = { patch: { PrivateNote: "x", extra: 1 }, raw: { z: 1 } };
    const { cleaned, extras } = collectAndStrip(schema, input);
    expect(extras).toEqual([]);
    expect(cleaned).toEqual(input);
  });

  it("does not walk union or discriminated-union subtrees", () => {
    const simple = z.object({ field: z.string(), value: z.string() });
    const legacy = z.object({ key: z.string(), value: z.union([z.string(), z.boolean()]) });
    const schema = z.object({ criteria: z.array(simple.or(legacy)) });
    const input = { criteria: [{ field: "TotalAmt", value: "0", zzz: "1" }] };
    const { extras } = collectAndStrip(schema, input);
    expect(extras).toEqual([]);
    const tagged = z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("a"), v: z.string() }),
      z.object({ kind: z.literal("b"), v: z.number() }),
    ]);
    const duSchema = z.object({ u: tagged });
    expect(collectAndStrip(duSchema, { u: { kind: "a", v: "x", z: 1 } }).extras).toEqual([]);
  });

  it("unwraps root-level effects before walking", () => {
    const schema = z
      .object({ a: z.string() })
      .superRefine((val, ctx) => {
        if (val.a === "bad") ctx.addIssue({ code: z.ZodIssueCode.custom, message: "nope" });
      });
    const { cleaned, extras } = collectAndStrip(schema, { a: "ok", z: 1 });
    expect(extras).toEqual(["z"]);
    expect(cleaned).toEqual({ a: "ok" });
  });

  it("returns early for nullish or non-object roots and malformed nested values", () => {
    const schema = z.object({
      items: z.array(z.object({ a: z.string() })),
      meta: z.object({ b: z.string() }),
    });
    expect(collectAndStrip(schema, null).cleaned).toBeNull();
    expect(collectAndStrip(schema, undefined).cleaned).toBeUndefined();
    expect(collectAndStrip(schema, [] as unknown as Record<string, unknown>).cleaned).toEqual([]);
    const { cleaned, extras } = collectAndStrip(schema, {
      items: "nope",
      meta: 1,
    } as unknown as Record<string, unknown>);
    expect(extras).toEqual([]);
    expect(cleaned).toEqual({ items: "nope", meta: 1 });
  });

  it("treats catchall objects as passthrough", () => {
    const schema = z.object({ a: z.string() }).catchall(z.string());
    expect(isPassthroughObject(schema)).toBe(true);
    const { extras } = collectAndStrip(schema, { a: "x", extra: "y" });
    expect(extras).toEqual([]);
  });

  it("strips extras in criteria arrays without unions", () => {
    const criterion = z.object({
      field: z.string(),
      value: z.string(),
      operator: z.string().optional(),
    });
    const schema = z.object({ criteria: z.array(criterion) });
    const input = { criteria: [{ field: "TotalAmt", value: "0", operator: ">", zzz: "1" }] };
    const { cleaned, extras } = collectAndStrip(schema, input);
    expect(extras).toEqual(["criteria[0].zzz"]);
    expect(cleaned).toEqual({ criteria: [{ field: "TotalAmt", value: "0", operator: ">" }] });
  });
});

describe("nestedUnsupportedWarning", () => {
  it("matches top-level-only warning text from main", () => {
    const params = { customer_ref: "1", ship_date: "2026-09-01" };
    const topKnown = new Set(["customer_ref"]);
    const collected = collectAndStrip(z.object({ customer_ref: z.string() }), params);
    const fromNested = nestedUnsupportedWarning("create_invoice", topKnown, collected, params);
    const fromTop = unsupportedParamsWarning("create_invoice", topKnown, params);
    expect(fromNested).toBe(fromTop);
  });

  it("sorts multiple Supported-in lines by path", () => {
    const aLine = z.object({ a: z.string() });
    const bLine = z.object({ b: z.string() });
    const schema = z.object({ aa: z.array(aLine), bb: z.array(bLine) });
    const params = {
      aa: [{ a: "1", x: 1 }],
      bb: [{ b: "2", y: 2 }],
    };
    const collected = collectAndStrip(schema, params);
    const warning = nestedUnsupportedWarning("t", new Set(["aa", "bb"]), collected, params)!;
    const aaPos = warning.indexOf("Supported in aa[]");
    const bbPos = warning.indexOf("Supported in bb[]");
    expect(aaPos).toBeGreaterThan(-1);
    expect(bbPos).toBeGreaterThan(aaPos);
  });

  it("lists mixed top-level and nested paths with supported nested fields", () => {
    const line = z.object({ item_ref: z.string(), qty: z.number(), unit_price: z.number() });
    const schema = z.object({ customer_ref: z.string(), line_items: z.array(line) });
    const params = {
      customer_ref: "4",
      ship_date: "2026-10-21",
      line_items: [{ item_ref: "4", qty: 1, unit_price: 1, class_ref: "682828" }],
    };
    const collected = collectAndStrip(schema, params);
    const warning = nestedUnsupportedWarning(
      "create_invoice",
      new Set(["customer_ref", "line_items"]),
      collected,
      params
    )!;
    expect(warning).toContain("ship_date, line_items[0].class_ref");
    expect(warning).toContain("\nSupported in line_items[]: item_ref, qty, unit_price.");
  });

  it("builds Supported-in hints for nested plain objects", () => {
    const schema = z.object({ a: z.object({ b: z.string() }) });
    const params = { a: { b: "v", x: 1 } };
    const collected = collectAndStrip(schema, params);
    const warning = nestedUnsupportedWarning("t", new Set(["a"]), collected, params)!;
    expect(warning).toContain("a.x");
    expect(warning).toContain("\nSupported in a: b.");
  });

  it("omits Supported-in lines when extras look nested but are top-level keys", () => {
    const schema = z.object({ customer_ref: z.string() });
    const params = { customer_ref: "1", "line_items[0].x": 1 };
    const collected = collectAndStrip(schema, params);
    const warning = nestedUnsupportedWarning(
      "create_invoice",
      new Set(["customer_ref"]),
      collected,
      params
    )!;
    expect(warning).toContain("line_items[0].x");
    expect(warning).not.toContain("\nSupported in");
  });

  it("returns null when nested extras exist but top-level keys are unknown", () => {
    const line = z.object({ item_ref: z.string() });
    const schema = z.object({ line_items: z.array(line) });
    const collected = collectAndStrip(schema, {
      line_items: [{ item_ref: "1", z: 1 }],
    });
    expect(nestedUnsupportedWarning("t", null, collected, {})).toBeNull();
  });

  it("caps named paths at 10 with a remainder count", () => {
    const line = z.object({ a: z.string() });
    const schema = z.object({ line_items: z.array(line) });
    const params = {
      line_items: Array.from({ length: 15 }, (_, i) => ({ a: "x", [`e${i}`]: i })),
    };
    const collected = collectAndStrip(schema, params);
    const warning = nestedUnsupportedWarning("create_invoice", new Set(["line_items"]), collected, params)!;
    expect(warning).toContain("and 5 more");
    expect(warning.match(/line_items\[\d+\]\.e\d+/g)?.length).toBe(10);
  });
});

describe("deepPermissiveSchema", () => {
  it("rebuilds nullable, default, and effects-wrapped fields", () => {
    const schema = z.object({
      n: z.string().nullable(),
      d: z.string().default("d"),
      line: z.object({ a: z.string() }).superRefine(() => undefined),
    });
    const rebuilt = deepPermissiveSchema(schema);
    const parsed = rebuilt.parse({ n: null, line: { a: "1", extra: 2 } }) as unknown as {
      line: { a: string; extra: number };
      d: string;
    };
    expect(parsed.line.extra).toBe(2);
    expect(rebuilt.parse({ n: null, line: { a: "1" } }).d).toBe("d");
    expect(deepPermissiveSchema(z.string().nullable()).parse(null)).toBeNull();
    expect(deepPermissiveSchema(z.number().default(1)).parse(undefined)).toBe(1);
    const effectOnly = deepPermissiveSchema(
      z.object({ a: z.string() }).superRefine(() => undefined)
    );
    expect((effectOnly.parse({ a: "x", y: 1 }) as unknown as { y: number }).y).toBe(1);
  });

  it("walks default-wrapped root schemas during collection", () => {
    const schema = z.object({ a: z.string() }).default({ a: "d" });
    const { cleaned, extras } = collectAndStrip(schema, { a: "x", z: 1 });
    expect(extras).toEqual(["z"]);
    expect(cleaned).toEqual({ a: "x" });
  });

  it("returns passthrough object schemas unchanged", () => {
    const pt = z.object({ a: z.string() }).passthrough();
    expect(deepPermissiveSchema(pt)).toBe(pt);
  });

  it("returns schemas it cannot reshape unchanged", () => {
    const throwingShape = {
      _def: {
        typeName: "ZodObject",
        unknownKeys: "strip",
        shape: () => {
          throw new Error("shape");
        },
      },
    } as unknown as z.ZodTypeAny;
    expect(deepPermissiveSchema(throwingShape)).toBe(throwingShape);
  });

  it("returns wrapper schemas unchanged when inner shape is unchanged", () => {
    const tags = z.array(z.string()).min(1).describe("Tags");
    const billEmail = z.string().optional().describe("Billing email");
    const withDefault = z.string().default("x");
    const withEffect = z.string().superRefine((v) => v.length > 0);
    expect(deepPermissiveSchema(tags)).toBe(tags);
    expect(deepPermissiveSchema(billEmail)).toBe(billEmail);
    expect(deepPermissiveSchema(withDefault)).toBe(withDefault);
    expect(deepPermissiveSchema(withEffect)).toBe(withEffect);
  });

  it("rebuilds nullable and default wrappers when inner objects gain passthrough", () => {
    const nullableInner = z.object({ a: z.string() }).nullable().describe("payload");
    const defaultInner = z.object({ a: z.string() }).default({ a: "x" });
    const nullable = deepPermissiveSchema(nullableInner);
    const withDefault = deepPermissiveSchema(defaultInner);
    expect(nullable).not.toBe(nullableInner);
    expect(withDefault).not.toBe(defaultInner);
    expect(nullable.description).toBe("payload");
    expect(
      (nullable as z.ZodNullable<z.ZodTypeAny>).unwrap().parse({ a: "1", extra: 2 } as any).extra
    ).toBe(2);
  });

  it("preserves min length and descriptions on arrays after rebuild", () => {
    const lineItems = z
      .array(z.object({ item_ref: z.string().describe("Item Id") }))
      .min(1)
      .describe("Lines");
    const schema = z.object({ customer_ref: z.string(), line_items: lineItems });
    const rebuilt = deepPermissiveSchema(schema);
    expect(() => rebuilt.parse({ customer_ref: "1", line_items: [] })).toThrow(/at least 1 element/i);
    const field = (rebuilt as z.ZodObject<any>).shape.line_items;
    expect(field.description).toBe("Lines");
    expect((field as z.ZodArray<any>)._def.minLength?.value).toBe(1);
  });

  it("preserves descriptions and required arrays in tools/list JSON (ignoring additionalProperties)", async () => {
    const base = z.object({
      customer_ref: z.string().describe("Customer Id"),
      line_items: z
        .array(
          z.object({
            item_ref: z.string().describe("Item Id"),
            qty: z.number(),
          })
        )
        .min(1),
    });

    const serverA = new McpServer({ name: "a", version: "0" });
    const serverB = new McpServer({ name: "b", version: "0" });
    serverA.tool("t", "desc", { params: base }, async () => ({ content: [{ type: "text", text: "ok" }] }));
    serverB.tool("t", "desc", { params: deepPermissiveSchema(base) }, async () => ({
      content: [{ type: "text", text: "ok" }],
    }));

    const pair = async (server: McpServer) => {
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      const client = new Client({ name: "c", version: "0" });
      await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
      const list = await client.listTools();
      await client.close();
      return stripAdditionalProperties(list.tools[0]!.inputSchema);
    };

    expect(await pair(serverA)).toEqual(await pair(serverB));
  });
});

