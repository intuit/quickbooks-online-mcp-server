/**
 * Extracts the QuickBooks Online fault detail from an API error, if present.
 *
 * node-quickbooks surfaces HTTP failures as axios errors whose message is
 * only the status line (e.g. "Request failed with status code 400"). The
 * actionable QBO message (e.g. "property 'EntityRef' is not queryable")
 * lives in the response body under Fault.Error[], so it is appended here
 * whenever it can be found.
 */
function extractQuickbooksFault(error: unknown): string | null {
  const fault = (
    error as { response?: { data?: { Fault?: { Error?: Array<{ Message?: string; Detail?: string }> } } } } | null
  )?.response?.data?.Fault;

  if (!fault || !Array.isArray(fault.Error)) {
    return null;
  }

  const parts = fault.Error
    .map((e) => (e.Detail ? `${e.Message ?? 'Unknown fault'}: ${e.Detail}` : e.Message))
    .filter((part): part is string => Boolean(part));

  return parts.length > 0 ? parts.join('; ') : null;
}

/**
 * Formats an error into a standardized error message
 * @param error Any error object to format
 * @returns A formatted error message as a string
 */
export function formatError(error: unknown): string {
  let base: string;
  if (error instanceof Error) {
    base = `Error: ${error.message}`;
  } else if (typeof error === 'string') {
    base = `Error: ${error}`;
  } else {
    base = `Unknown error: ${JSON.stringify(error)}`;
  }

  const quickbooksFault = extractQuickbooksFault(error);
  return quickbooksFault ? `${base} | QuickBooks: ${quickbooksFault}` : base;
}
