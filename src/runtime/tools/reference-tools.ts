import { z } from "zod";
import { cachedEntity, REFERENCE_TTL_MS } from "../cache/reference-cache.js";
import { describeCapabilities } from "../invoice-field-policy.js";
import { companyCapabilitiesOrNull } from "../preferences.js";
import { formatError } from "../qbo-error.js";
import { getCompanyInfoForTenant, getCustomerById, getItemById, type QboRow } from "../qbo-query-methods.js";
import type { AnyToolDefinition } from "../tool-allowlist.js";

/**
 * Single-entity reference reads, cached per realm.
 *
 * These replace upstream's get_customer, read_item and get_company_info for two
 * reasons. First, caching: a planner composing an invoice reads the same customer
 * and the same handful of items several times in one conversation, and reads are
 * the metered half of Intuit's pricing. Second, upstream's get_company_info takes
 * a caller-supplied company_id, which has no legitimate use here — the company is
 * whichever one the request's grant is for, and letting a model name one invites
 * exactly the confusion this service is built to prevent.
 *
 * Unlike search, these return the whole entity: resolving an id is what search is
 * for, and a caller reaching here has already chosen the record and needs its
 * addresses, terms and tax defaults in full.
 */

const idSchema = z
  .string()
  .min(1)
  .max(32)
  .regex(/^[0-9]+$/, "must be a QuickBooks numeric id");

function seconds(ms: number): number {
  return Math.round(ms / 1000);
}

function ok(row: QboRow): { content: Array<{ type: "text"; text: string }> } {
  return { content: [{ type: "text" as const, text: JSON.stringify(row) }] };
}

function failed(what: string, error: unknown): { content: Array<{ type: "text"; text: string }> } {
  return { content: [{ type: "text" as const, text: `Error reading ${what}: ${formatError(error)}` }] };
}

const customerSchema = z.object({ customer_id: idSchema });

export const GetCustomerTool: AnyToolDefinition = {
  name: "get_customer",
  description:
    "Read one customer from the connected QuickBooks company in full, including billing address, currency " +
    `and default terms. Answers may be up to ${seconds(REFERENCE_TTL_MS.customer)}s old.`,
  schema: customerSchema,
  handler: async ({ params }: { params: z.infer<typeof customerSchema> }) => {
    try {
      return ok(await cachedEntity("customer", params.customer_id, () => getCustomerById(params.customer_id)));
    } catch (error) {
      return failed(`customer ${params.customer_id}`, error);
    }
  },
} as unknown as AnyToolDefinition;

const itemSchema = z.object({ item_id: idSchema });

export const ReadItemTool: AnyToolDefinition = {
  name: "read_item",
  description:
    "Read one product or service from the connected QuickBooks company in full, including unit price, " +
    `income account and tax code. Answers may be up to ${seconds(REFERENCE_TTL_MS.item)}s old.`,
  schema: itemSchema,
  handler: async ({ params }: { params: z.infer<typeof itemSchema> }) => {
    try {
      return ok(await cachedEntity("item", params.item_id, () => getItemById(params.item_id)));
    } catch (error) {
      return failed(`item ${params.item_id}`, error);
    }
  },
} as unknown as AnyToolDefinition;

/**
 * No parameters, deliberately: the company is the one the request's grant is for.
 * An empty object rather than no schema at all, so the shape stays uniform for
 * registration and for hosts that require an input schema.
 */
const companyInfoSchema = z.object({});

export const GetCompanyInfoTool: AnyToolDefinition = {
  name: "get_company_info",
  description:
    "Read the connected QuickBooks company's own details — name, legal name, country, address, fiscal year " +
    "start — together with what its settings allow on an invoice: whether multicurrency is on, how sales " +
    "tax is handled, and whether invoice numbers may be supplied. Read this before composing an invoice.",
  schema: companyInfoSchema,
  handler: async () => {
    try {
      // Keyed by "self" because the realm is already the cache key's prefix.
      const info = await cachedEntity("companyInfo", "self", getCompanyInfoForTenant);
      // Both are cached per realm, so the pair costs at most two reads per company
      // every fifteen minutes; fetched together because a caller needs both before
      // it can compose a valid invoice.
      const capabilities = await companyCapabilitiesOrNull();
      return ok({
        ...info,
        invoice_capabilities: capabilities === null ? "unavailable" : describeCapabilities(capabilities),
      });
    } catch (error) {
      return failed("company info", error);
    }
  },
} as unknown as AnyToolDefinition;
