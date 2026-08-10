import { z } from "zod";

export interface QuickbooksFilter {
  /** Field/column name to filter on */
  field: string;
  /** Value to match against */
  value: any;
  /** Comparison operator to use (default '=') */
  operator?: string;
}

// ── Shared criterion schema + type coercion ─────────────────────────────────
// One schema for every search tool's criteria array. Values are accepted
// NATIVELY as string, number, boolean, or an array (for IN) — node-quickbooks
// quotes strings, leaves numbers/booleans bare, and expands arrays to a SQL
// tuple, so the type we forward is the type QBO's SQL sees. Rejecting numbers
// (old schemas: z.string()|z.boolean()) or forwarding boolean-as-string
// ("true" → QBO "String cannot be cast to Boolean") were both production bugs.
export const searchCriterionValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.union([z.string(), z.number()])).min(1),
]);

export const searchCriterionSchema = z.object({
  field: z.string().min(1).describe("QBO field/column name to filter on"),
  value: searchCriterionValueSchema.describe(
    "Match value. Use the native JSON type (number for amounts, boolean for flags like Active, string otherwise). For the IN operator pass a JSON array of values."
  ),
  operator: z
    .enum(["=", "<", ">", "<=", ">=", "LIKE", "IN"])
    .optional()
    .describe("Comparison operator. Defaults to '='. IN expects value to be a JSON array."),
});

// QBO fields that are boolean-typed in the query grammar. A string "true"
// forwarded to one of these produces QueryProcessingError: String cannot be
// cast to Boolean — coerce it. Everything else keeps its native type.
const BOOLEAN_QUERY_FIELDS = new Set([
  "active",
  "taxable",
  "hidden",
  "taxgroup",
  "vendor1099",
  "isadjustment",
  "applytaxafterdiscount",
  "isproject",
  "job",
]);

/**
 * Coerce criterion values to the types QBO's query grammar expects:
 * - "true"/"false" strings on known boolean fields → real booleans
 * - IN operator with an array → left native (node-quickbooks builds the tuple)
 * - IN operator with a pre-built SQL-tuple string "('a','b')" → parsed into an
 *   array (forwarding the raw tuple string is double-quoted by the SQL builder
 *   and yields QueryParserError)
 */
export function coerceCriterionTypes(criteria: QuickbooksFilter[]): QuickbooksFilter[] {
  return criteria.map((c) => {
    let value = c.value;
    const operator = c.operator;
    if (typeof value === "string") {
      const lower = value.toLowerCase();
      if (BOOLEAN_QUERY_FIELDS.has(c.field.toLowerCase()) && (lower === "true" || lower === "false")) {
        value = lower === "true";
      } else if (operator === "IN" && /^\(.*\)$/.test(value.trim())) {
        value = value
          .trim()
          .slice(1, -1)
          .split(",")
          .map((part) => part.trim().replace(/^'(.*)'$/, "$1"))
          .filter((part) => part.length > 0);
      }
    }
    return { field: c.field, value, operator };
  });
}

// ── Search-result shaping (fields projection / summary mode) ────────────────

/** Project each entity to the requested dot-path fields (e.g. "VendorRef.name"). */
export function projectEntityFields(entities: any[], fields: string[]): any[] {
  const pick = (obj: any, path: string) =>
    path.split(".").reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
  return entities.map((entity) => {
    const out: Record<string, any> = {};
    for (const field of fields) {
      const value = pick(entity, field);
      if (value !== undefined) out[field] = value;
    }
    return out;
  });
}

/** One compact line per entity: the fields that identify a transaction at a glance. */
export function summarizeEntities(entities: any[]): any[] {
  return entities.map((e) => ({
    Id: e?.Id,
    DocNumber: e?.DocNumber,
    Name: e?.DisplayName ?? e?.Name,
    VendorRef: e?.VendorRef?.name,
    CustomerRef: e?.CustomerRef?.name,
    TxnDate: e?.TxnDate,
    TotalAmt: e?.TotalAmt,
    Balance: e?.Balance,
  }));
}

/** Apply summary/fields shaping to a search result array, if requested. */
export function shapeSearchResults(
  entities: any[],
  options: { fields?: string[]; summary?: boolean }
): any[] {
  if (options.summary) return summarizeEntities(entities);
  if (options.fields && options.fields.length > 0) return projectEntityFields(entities, options.fields);
  return entities;
}

export interface AdvancedQuickbooksSearchOptions {
  /** Array of filter objects that map to QuickBooks query filters */
  filters?: QuickbooksFilter[];
  /** Alias for filters — accepted by several tool schemas */
  criteria?: QuickbooksFilter[];
  /** Sort ascending by the provided field */
  asc?: string;
  /** Sort descending by the provided field */
  desc?: string;
  /** Maximum number of rows to return */
  limit?: number;
  /** Number of rows to skip from the start of the result set */
  offset?: number;
  /** If true, only a count of rows is returned */
  count?: boolean;
  /** If true, transparently fetches all records. */
  fetchAll?: boolean;
}

/**
 * User-supplied criteria can be one of:
 *  1. A simple criteria object (e.g. { Name: 'Foo' })
 *  2. An array of objects specifying field/value/operator
 *  3. An {@link AdvancedQuickbooksSearchOptions} object that is translated to the array format expected by node-quickbooks
 */
export type QuickbooksSearchCriteriaInput =
  | Record<string, any>
  | Array<Record<string, any>>
  | AdvancedQuickbooksSearchOptions;

/**
 * Convert various input shapes into the criteria shape that `node-quickbooks` expects.
 *
 * If the input is already an object or array that `node-quickbooks` understands, it is returned untouched.
 * If the input is an {@link AdvancedQuickbooksSearchOptions} instance, it is converted to an array of
 * `{field, value, operator}` objects.
 */
export function buildQuickbooksSearchCriteria(
  input: QuickbooksSearchCriteriaInput
): Record<string, any> | Array<Record<string, any>> {
  // If the user supplied an array we assume they know what they're doing —
  // but still coerce value types on {field,value} entries so boolean-string
  // and SQL-tuple-string inputs can't reach QBO's query grammar raw.
  if (Array.isArray(input)) {
    return (input as Array<Record<string, any>>).map((entry) =>
      entry && typeof entry === "object" && "field" in entry && "value" in entry
        ? coerceCriterionTypes([entry as QuickbooksFilter])[0]
        : entry
    );
  }

  // If the input is a plain object that does NOT look like advanced options, forward as-is
  const possibleAdvancedKeys: (keyof AdvancedQuickbooksSearchOptions)[] = [
    "filters",
    "criteria",
    "asc",
    "desc",
    "limit",
    "offset",
    "count",
    "fetchAll",
  ];

  const inputKeys = Object.keys(input || {});
  const isAdvanced = inputKeys.some((k) =>
    possibleAdvancedKeys.includes(k as keyof AdvancedQuickbooksSearchOptions)
  );

  if (!isAdvanced) {
    // simple criteria object – pass through
    return input as Record<string, any>;
  }

  // At this point we treat the input as AdvancedQuickbooksSearchOptions
  const options = input as AdvancedQuickbooksSearchOptions;
  const criteriaArr: Array<Record<string, any>> = [];

  // Convert filters (accept both "filters" and "criteria" as the key),
  // coercing value types to what QBO's query grammar expects.
  const filterList = options.filters ?? options.criteria;
  if (filterList) {
    for (const f of coerceCriterionTypes(filterList)) {
      criteriaArr.push({ field: f.field, value: f.value, operator: f.operator });
    }
  }

  // Sorting
  if (options.asc) {
    criteriaArr.push({ field: "asc", value: options.asc });
  }
  if (options.desc) {
    criteriaArr.push({ field: "desc", value: options.desc });
  }

  // Pagination / meta
  if (typeof options.limit === "number") {
    criteriaArr.push({ field: "limit", value: options.limit });
  }
  if (typeof options.offset === "number") {
    criteriaArr.push({ field: "offset", value: options.offset });
  }
  if (options.count) {
    criteriaArr.push({ field: "count", value: true });
  }
  if (options.fetchAll) {
    criteriaArr.push({ field: "fetchAll", value: true });
  }

  // If nothing ended up in the array, return empty object so Quickbooks returns all items.
  return criteriaArr.length > 0 ? criteriaArr : {};
} 