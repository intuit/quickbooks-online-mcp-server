import { z } from "zod";
import { cachedQuery, type ReferenceKind } from "../cache/reference-cache.js";
import { buildCriteria, pageFields, renderPage, resolvePage, toPage, type SortInput } from "../pagination.js";
import { formatError } from "../qbo-error.js";
import type { QboRow } from "../qbo-query-methods.js";
import type { AnyToolDefinition } from "../tool-allowlist.js";

/**
 * One search implementation for every entity this service searches.
 *
 * Replaces upstream's five hand-written search tools, which differ from each
 * other in ways nobody intended and share two defects:
 *
 *  - The exposed schema is `criteria: z.any()`, and the runtime schema meant to
 *    police it is `z.union([z.record(z.any()), ..., advancedCriteriaSchema])`. A
 *    Zod union takes the first member that matches and `z.record(z.any())`
 *    matches every object, so the allowed-field list is unreachable. Field names
 *    then reach node-quickbooks unvalidated, and it concatenates them into the
 *    query string without quoting.
 *  - `fetchAll: true` is accepted, and the library honours it by paging until the
 *    company is exhausted and concatenating everything into one array.
 *
 * Here the field lists are `z.enum`, so an unknown field is rejected before any
 * query is built, and there is no way to express "everything": the page size has
 * a ceiling and the only route to more rows is another explicit call.
 */

/** More filters than this is a report, not a lookup, and bloats the where clause. */
const MAX_FILTERS = 8;

const OPERATORS = ["=", "IN", "<", ">", "<=", ">=", "LIKE"] as const;

/** QuickBooks compares against scalars, or a list for IN. */
const filterValueSchema = z.union([
  z.string().min(1).max(256),
  z.number(),
  z.boolean(),
  z.array(z.union([z.string().min(1).max(256), z.number()])).min(1).max(50),
]);

export interface SearchToolSpec {
  readonly name: string;
  readonly description: string;
  /** Plural noun for the summary line, e.g. "invoices". */
  readonly label: string;
  readonly filterFields: readonly [string, ...string[]];
  readonly sortFields: readonly [string, ...string[]];
  readonly defaultSort: SortInput;
  readonly fetch: (criteria: unknown) => Promise<QboRow[]>;
  readonly project: (row: QboRow) => QboRow;
  /**
   * Set for slow-moving reference data, which is worth caching per realm. Left
   * unset for transaction data, where a stale answer is a correctness bug.
   */
  readonly cacheKind?: ReferenceKind;
}

function buildSchema(spec: SearchToolSpec) {
  return z.object({
    filters: z
      .array(
        z
          .object({
            field: z.enum(spec.filterFields),
            value: filterValueSchema,
            operator: z.enum(OPERATORS).optional(),
          })
          .superRefine((filter, ctx) => {
            const isList = Array.isArray(filter.value);
            if (filter.operator === "IN" && !isList) {
              ctx.addIssue({ code: z.ZodIssueCode.custom, message: "operator IN requires an array value" });
            }
            if (filter.operator !== "IN" && isList) {
              ctx.addIssue({ code: z.ZodIssueCode.custom, message: "an array value requires operator IN" });
            }
            if (filter.operator === "LIKE" && typeof filter.value !== "string") {
              ctx.addIssue({ code: z.ZodIssueCode.custom, message: "operator LIKE requires a string value" });
            }
          }),
      )
      .max(MAX_FILTERS)
      .optional()
      .describe(`Up to ${MAX_FILTERS} conditions, combined with AND.`),
    sort_by: z.enum(spec.sortFields).optional(),
    sort_dir: z.enum(["asc", "desc"]).optional(),
    ...pageFields,
  });
}

type SearchParams = z.infer<ReturnType<typeof buildSchema>>;

/**
 * Complexity: one QuickBooks request per call, returning at most
 * `limit + 1` rows, projected in O(rows × fields). No path fans out into
 * additional requests, so cost per tool call is constant in the size of the
 * company's books.
 */
export function createSearchTool(spec: SearchToolSpec): AnyToolDefinition {
  const schema = buildSchema(spec);

  const handler = async ({ params }: { params: SearchParams }) => {
    try {
      const page = resolvePage(params);
      const sort: SortInput = params.sort_by
        ? { field: params.sort_by, direction: params.sort_dir ?? "asc" }
        : spec.defaultSort;

      const criteria = buildCriteria({ filters: params.filters, page, sort });

      // Cached entries hold projected rows, not raw entities: a projected row is
      // roughly an order of magnitude smaller, which is what keeps the cache's
      // entry ceiling a meaningful memory bound.
      const load = async (): Promise<QboRow[]> => (await spec.fetch(criteria)).map(spec.project);
      const rows = spec.cacheKind ? await cachedQuery(spec.cacheKind, criteria, load) : await load();

      return renderPage(spec.label, toPage(rows, page), page);
    } catch (error) {
      return {
        content: [{ type: "text" as const, text: `Error searching ${spec.label}: ${formatError(error)}` }],
      };
    }
  };

  return {
    name: spec.name,
    description: spec.description,
    schema,
    handler,
  } as unknown as AnyToolDefinition;
}
