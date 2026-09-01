import { z } from "zod";

// QBO's real GlobalTaxCalculation enum. "TaxExclusive" is a common misspelling
// of "TaxExcluded" — QBO rejects it with an opaque HTTP-400 "Failed to parse
// json object" Fault (the request never posts), so we normalize it client-side
// and fail anything else with an actionable message instead.
export const QBO_GLOBAL_TAX_VALUES = ["TaxExcluded", "TaxInclusive", "NotApplicable"] as const;
export type QboGlobalTaxCalculation = (typeof QBO_GLOBAL_TAX_VALUES)[number];

const ALIASES: Record<string, QboGlobalTaxCalculation> = {
  taxexclusive: "TaxExcluded", // the misspelling QBO chokes on
  taxexcluded: "TaxExcluded",
  taxinclusive: "TaxInclusive",
  notapplicable: "NotApplicable",
};

// Schema for tool inputs: advertises the three real values plus the known
// misspelling so callers get client-side validation rather than a QBO parse
// fault. Handlers MUST pass the accepted value through
// normalizeGlobalTaxCalculation before forwarding.
export const globalTaxCalculationInputSchema = z
  .enum([...QBO_GLOBAL_TAX_VALUES, "TaxExclusive"])
  .describe(
    "How line amounts relate to tax: TaxExcluded (tax added on top), TaxInclusive (tax contained within amounts), or NotApplicable. 'TaxExclusive' is accepted as an alias and normalized to 'TaxExcluded'."
  );

/**
 * Normalize a GlobalTaxCalculation value to QBO's exact enum spelling.
 * Returns undefined for undefined/null input. Throws an Error with a clear,
 * actionable message for anything unrecognized — never let an invalid value
 * reach QBO, whose response is an opaque parse fault.
 */
export function normalizeGlobalTaxCalculation(value: unknown): QboGlobalTaxCalculation | undefined {
  if (value === undefined || value === null) return undefined;
  const normalized = ALIASES[String(value).toLowerCase()];
  if (!normalized) {
    throw new Error(
      `Invalid GlobalTaxCalculation "${String(value)}". Valid values: ${QBO_GLOBAL_TAX_VALUES.join(", ")} ` +
        `("TaxExclusive" is also accepted and mapped to "TaxExcluded").`
    );
  }
  return normalized;
}

/**
 * In-place normalization for QBO-shaped payload objects (create-bill,
 * create_purchase, ...) that carry GlobalTaxCalculation verbatim.
 */
export function normalizePayloadGlobalTax<T extends { GlobalTaxCalculation?: unknown }>(payload: T): T {
  if (payload && payload.GlobalTaxCalculation !== undefined) {
    payload.GlobalTaxCalculation = normalizeGlobalTaxCalculation(payload.GlobalTaxCalculation);
  }
  return payload;
}
