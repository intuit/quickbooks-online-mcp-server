import { formatError } from "./format-error.js";

export type LineWithOptionalClassRef = { class_ref?: string };

const CLASS_ID_PATTERN = /^\d+$/;

export const NON_NUMERIC_CLASS_REF_ERROR =
  "Error: line_items[].class_ref must be a QuickBooks Class Id (numeric), not a class name. Use search_classes to look up the Id for each class. Per-line class_ref requires per-line class tracking (ClassTrackingPerTxnLine) in QuickBooks Plus or Advanced.";

export function lineItemsIncludeClassRef(lineItems: LineWithOptionalClassRef[]): boolean {
  return lineItems.some((line) => Boolean(line.class_ref));
}

export function validateLineClassRefs(lineItems: LineWithOptionalClassRef[]): string | null {
  for (const line of lineItems) {
    if (line.class_ref && !CLASS_ID_PATTERN.test(line.class_ref)) {
      return NON_NUMERIC_CLASS_REF_ERROR;
    }
  }
  return null;
}

export function describeClassTrackingPreferenceHint(preferences: unknown): string | null {
  if (!preferences || typeof preferences !== "object") {
    return null;
  }
  const prefs = preferences as Record<string, unknown>;
  const accounting =
    (prefs.AccountingInfoPrefs as Record<string, unknown> | undefined) ??
    ((prefs.Preferences as Record<string, unknown> | undefined)?.AccountingInfoPrefs as
      | Record<string, unknown>
      | undefined);

  if (!accounting) {
    return null;
  }

  const perLine = accounting.ClassTrackingPerTxnLine === true;
  const perTxn = accounting.ClassTrackingPerTxn === true;

  if (!perLine && !perTxn) {
    return (
      "Class tracking note: Class tracking appears to be off or unavailable on this company " +
      "(QuickBooks Plus or Advanced with class tracking enabled is required). " +
      "Line-level class_ref is not applicable."
    );
  }

  if (perTxn && !perLine) {
    return (
      "Class tracking note: This company is set to one class per transaction, not per line. " +
      "Line-level class_ref is not valid — assign a transaction-level ClassRef instead, or enable " +
      '"Track class" per row in QuickBooks company settings (ClassTrackingPerTxnLine).'
    );
  }

  return null;
}

const GENERIC_CLASS_REF_DROPPED_SUFFIX =
  "Line-level class tracking may be disabled or misconfigured in this company.";

function getPreferences(quickbooks: unknown): Promise<unknown> {
  return new Promise((resolve, reject) => {
    (quickbooks as { getPreferences: (cb: (err: unknown, prefs: unknown) => void) => void }).getPreferences(
      (err, preferences) => {
        if (err) {
          reject(err);
        } else {
          resolve(preferences);
        }
      }
    );
  });
}

function getSalesItemLines(savedTxn: unknown): Array<{ SalesItemLineDetail?: { ClassRef?: { value?: string } } }> {
  const lines = (savedTxn as { Line?: unknown[] } | null)?.Line;
  if (!Array.isArray(lines)) {
    return [];
  }
  return lines.filter(
    (line): line is { SalesItemLineDetail?: { ClassRef?: { value?: string } } } =>
      Boolean(line && typeof line === "object" && (line as { SalesItemLineDetail?: unknown }).SalesItemLineDetail)
  );
}

/** 1-based line numbers in the original line_items array where class_ref was not saved as requested. */
export function findClassRefMismatchedLineNumbers(
  lineItems: LineWithOptionalClassRef[],
  savedTxn: unknown
): number[] {
  const savedSalesLines = getSalesItemLines(savedTxn);
  const mismatches: number[] = [];
  for (let i = 0; i < lineItems.length; i++) {
    const requested = lineItems[i]?.class_ref;
    if (!requested) {
      continue;
    }
    const savedValue = savedSalesLines[i]?.SalesItemLineDetail?.ClassRef?.value;
    const saved = savedValue != null ? String(savedValue) : undefined;
    if (saved !== requested) {
      mismatches.push(i + 1);
    }
  }
  return mismatches;
}

function classTrackingHintWithoutPrefix(preferences: unknown): string | null {
  const hint = describeClassTrackingPreferenceHint(preferences);
  if (!hint) {
    return null;
  }
  return hint.replace(/^Class tracking note: /, "");
}

export async function applySalesCreateClassRefWarning(
  quickbooks: unknown,
  lineItems: LineWithOptionalClassRef[],
  created: unknown
): Promise<unknown> {
  if (!lineItemsIncludeClassRef(lineItems)) {
    return created;
  }
  const mismatched = findClassRefMismatchedLineNumbers(lineItems, created);
  if (mismatched.length === 0) {
    return created;
  }

  let suffix = GENERIC_CLASS_REF_DROPPED_SUFFIX;
  try {
    const preferences = await getPreferences(quickbooks);
    const tailored = classTrackingHintWithoutPrefix(preferences);
    if (tailored) {
      suffix = tailored;
    }
  } catch {
    // Best-effort preferences lookup when class_ref was dropped on save.
  }

  const lineList = mismatched.join(", ");
  const savedId = (created as { Id?: unknown }).Id;
  const recordRef = savedId != null ? `that record (Id ${String(savedId)})` : "that record";
  // Callers may react to _warning automatically, so state plainly that the
  // create already succeeded and must not be retried (a retry would duplicate it).
  const warning =
    `Warning: QuickBooks saved this transaction but did not apply class_ref on line(s) ${lineList}. ` +
    `The transaction already exists, so do not retry the create; read or update ${recordRef} instead. ${suffix}`;

  return { ...(created as object), _warning: warning };
}

export async function formatSalesCreateError(
  quickbooks: unknown,
  err: unknown,
  lineItems: LineWithOptionalClassRef[]
): Promise<string> {
  let message = formatError(err);
  if (!lineItemsIncludeClassRef(lineItems)) {
    return message;
  }
  try {
    const preferences = await getPreferences(quickbooks);
    const hint = describeClassTrackingPreferenceHint(preferences);
    if (hint) {
      message = `${message}\n\n${hint}`;
    }
  } catch {
    // Best-effort preferences lookup when class_ref was sent but the create failed.
  }
  return message;
}
