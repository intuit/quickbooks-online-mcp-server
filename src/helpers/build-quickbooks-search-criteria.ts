/**
 * A single filter for QuickBooks search criteria.
 */
export interface QuickbooksFilter {
  /** Field/column name to filter on */
  field: string;
  /** Value to match against */
  value: any;
  /** Comparison operator to use (default '=') */
  operator?: string;
}

/**
 * Advanced search options for QuickBooks queries with filtering, sorting, and pagination.
 */
export interface AdvancedQuickbooksSearchOptions {
  /** Array of filter objects that map to QuickBooks query filters */
  filters?: QuickbooksFilter[];
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
 * Union type for QuickBooks search criteria input.
 * Can be a simple criteria object, an array of filter objects, or advanced search options.
 *
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
 * Converts various input shapes into the criteria format expected by node-quickbooks.
 *
 * If the input is already an object or array that node-quickbooks understands, it is returned untouched.
 * If the input is an {@link AdvancedQuickbooksSearchOptions} instance, it is converted to an array of
 * filter/sort/pagination objects.
 *
 * @param input The search criteria in any supported format
 * @returns The criteria formatted for node-quickbooks (object or array)
 */
export function buildQuickbooksSearchCriteria(
  input: QuickbooksSearchCriteriaInput
): Record<string, any> | Array<Record<string, any>> {
  // If the user supplied an array we assume they know what they're doing.
  if (Array.isArray(input)) {
    return input as Array<Record<string, any>>;
  }

  // If the input is a plain object that does NOT look like advanced options, forward as-is
  const possibleAdvancedKeys: (keyof AdvancedQuickbooksSearchOptions)[] = [
    "filters",
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

  // Convert filters
  options.filters?.forEach((f) => {
    criteriaArr.push({ field: f.field, value: f.value, operator: f.operator });
  });

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