import { z } from "zod";

/**
 * Bounded paging for every search this service exposes.
 *
 * Upstream's search tools accept `criteria: z.any()` and forward it to
 * node-quickbooks, which defaults to 1000 rows and honours `fetchAll: true` by
 * recursively concatenating every record in the company into one array. A single
 * planner call could therefore pull an entire customer list into memory and then
 * into a model's context. Nothing here can express that: `fetchAll` is not in any
 * schema and is never emitted, the page size has a hard ceiling, and the
 * serialised page has a byte budget on top of the row count.
 *
 * Offsets are 1-based because QuickBooks' `startposition` is.
 */

/** Ceiling on rows per page. QuickBooks itself caps a query at 1000. */
export const MAX_PAGE_SIZE = 100;
export const DEFAULT_PAGE_SIZE = 20;

/**
 * Deep paging past this is a filtering problem, not a paging problem, and it
 * costs a metered read per page. Refusing it early is kinder than 500 pages.
 */
export const MAX_OFFSET = 10_000;

/**
 * Last-resort bound on a page's serialised size, independent of row count: a
 * handful of invoices with a hundred lines each would otherwise be large enough
 * to matter in a model's context even at a legal row count.
 */
export const MAX_PAGE_BYTES = 96 * 1024;

/** Spread into a tool schema to give it paging without restating the bounds. */
export const pageFields = {
  limit: z
    .number()
    .int()
    .min(1)
    .max(MAX_PAGE_SIZE)
    .optional()
    .describe(`Rows to return, 1-${MAX_PAGE_SIZE}. Defaults to ${DEFAULT_PAGE_SIZE}.`),
  offset: z
    .number()
    .int()
    .min(1)
    .max(MAX_OFFSET)
    .optional()
    .describe("1-based row to start from. Use the next_offset from the previous page."),
} as const;

/**
 * No count_only, deliberately. node-quickbooks only turns a query into
 * `select count(*)` when `count` is a property name on an object-form criteria
 * (its helper scans property names, so the array element `{field:'count'}` that
 * upstream emits never matches — upstream's count is silently a no-op). Object
 * form in turn forces `startposition`/`maxresults` onto the generated SQL, which
 * QuickBooks does not accept alongside an aggregate. `has_more` and `next_offset`
 * answer "is there more" without needing a total.
 */
export interface PageRequest {
  readonly limit: number;
  readonly offset: number;
}

export function resolvePage(params: { limit?: number; offset?: number }): PageRequest {
  return {
    limit: params.limit ?? DEFAULT_PAGE_SIZE,
    offset: params.offset ?? 1,
  };
}

export interface CriterionInput {
  readonly field: string;
  readonly value: unknown;
  readonly operator?: string;
}

export interface SortInput {
  readonly field: string;
  readonly direction: "asc" | "desc";
}

/**
 * Builds the array form node-quickbooks expects.
 *
 * Asks for one row more than the caller wants so `has_more` is a fact rather
 * than the guess `rows.length === limit` would give. Field names are the caller's
 * only route into the generated query string, so they must already have been
 * validated against a closed list by the calling tool's schema — this function
 * assumes that and does not revalidate.
 */
export function buildCriteria(input: {
  filters?: readonly CriterionInput[];
  page: PageRequest;
  sort?: SortInput;
}): Array<Record<string, unknown>> {
  const criteria: Array<Record<string, unknown>> = [];

  for (const filter of input.filters ?? []) {
    criteria.push({ field: filter.field, value: filter.value, operator: filter.operator ?? "=" });
  }

  if (input.sort) {
    criteria.push({ field: input.sort.direction, value: input.sort.field });
  }

  // One extra row, capped, so has_more is exact without a second request.
  criteria.push({ field: "limit", value: Math.min(input.page.limit + 1, MAX_PAGE_SIZE + 1) });
  criteria.push({ field: "offset", value: input.page.offset });

  return criteria;
}

export interface Page<T> {
  readonly rows: readonly T[];
  readonly hasMore: boolean;
  readonly nextOffset: number | null;
  /** Rows dropped to stay inside MAX_PAGE_BYTES, if any. */
  readonly droppedForSize: number;
}

/**
 * Trims an over-fetched result set to the requested page and enforces the byte
 * budget. Halving rather than dropping one at a time keeps this O(log n)
 * serialisations instead of O(n).
 */
export function toPage<T>(fetched: readonly T[], page: PageRequest): Page<T> {
  const hasMore = fetched.length > page.limit;
  let rows = fetched.slice(0, page.limit);
  let dropped = 0;

  while (rows.length > 1 && Buffer.byteLength(JSON.stringify(rows), "utf8") > MAX_PAGE_BYTES) {
    const keep = Math.floor(rows.length / 2);
    dropped += rows.length - keep;
    rows = rows.slice(0, keep);
  }

  return {
    rows,
    // A size-trimmed page always has more, whatever the row count said.
    hasMore: hasMore || dropped > 0,
    nextOffset: hasMore || dropped > 0 ? page.offset + rows.length : null,
    droppedForSize: dropped,
  };
}

/** One summary line plus one JSON block. Never one block per row. */
export function renderPage<T>(label: string, page: Page<T>, request: PageRequest): {
  content: Array<{ type: "text"; text: string }>;
} {
  const parts = [`${page.rows.length} ${label} (from row ${request.offset})`];
  if (page.hasMore && page.nextOffset !== null) parts.push(`more available: next_offset ${page.nextOffset}`);
  else parts.push("no further rows");
  if (page.droppedForSize > 0) {
    parts.push(
      `${page.droppedForSize} row(s) held back to keep the response under ${MAX_PAGE_BYTES} bytes — ` +
        "narrow the filter or read a smaller page",
    );
  }

  return {
    content: [
      { type: "text" as const, text: parts.join("; ") },
      { type: "text" as const, text: JSON.stringify(page.rows) },
    ],
  };
}
