import { cachedEntity } from "./cache/reference-cache.js";
import { getPreferencesForTenant, type QboRow } from "./qbo-query-methods.js";

/**
 * What the connected company actually supports.
 *
 * The same invoice payload is valid in one QuickBooks company and rejected — or
 * worse, silently altered — in another. A company without multicurrency has no
 * concept of a per-invoice currency. A company on Automated Sales Tax calculates
 * tax itself and ignores a manual tax block. A company that does not use custom
 * transaction numbers assigns DocNumber itself, so one supplied by a caller is
 * discarded without complaint.
 *
 * Each of those is a silent-wrong-answer bug if the tools assume the general case,
 * so the tools ask once per company and adapt. The probe is a single read cached
 * for fifteen minutes, which is far cheaper than the failed or wrong writes it
 * prevents.
 */

export interface CompanyCapabilities {
  /** Per-invoice CurrencyRef and ExchangeRate are meaningful only when true. */
  readonly multicurrency: boolean;
  /** The company's own currency, used when multicurrency is off. */
  readonly homeCurrency?: string;
  /** Sales tax is switched on at all. When false, no tax field is meaningful. */
  readonly usingSalesTax: boolean;
  /**
   * Automated Sales Tax. QuickBooks computes the tax itself from addresses and
   * line tax codes, and a caller-supplied TxnTaxDetail is not honoured.
   */
  readonly automatedSalesTax: boolean;
  /**
   * When false, QuickBooks assigns DocNumber and discards one that was supplied —
   * so DocNumber cannot serve as a deduplication key for that company.
   */
  readonly customTransactionNumbers: boolean;
  /** Company default, useful when a caller does not name a payment term. */
  readonly defaultTermId?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function child(value: unknown, key: string): Record<string, unknown> | undefined {
  if (!isRecord(value)) return undefined;
  const nested = value[key];
  return isRecord(nested) ? nested : undefined;
}

function bool(value: unknown): boolean {
  // QuickBooks has been known to answer with the string "true" for some prefs.
  return value === true || value === "true";
}

function refValue(value: unknown): string | undefined {
  const raw = isRecord(value) ? value.value : undefined;
  return typeof raw === "string" && raw.length > 0 ? raw : undefined;
}

/**
 * Reads capabilities off a Preferences entity.
 *
 * Every field defaults to the restrictive answer when absent. That direction
 * matters: assuming multicurrency is on when the response did not say so would
 * let a currency reach QuickBooks and be quietly dropped, which is the failure
 * this is meant to prevent.
 */
export function readCapabilities(preferences: QboRow): CompanyCapabilities {
  const currency = child(preferences, "CurrencyPrefs");
  const tax = child(preferences, "TaxPrefs");
  const salesForms = child(preferences, "SalesFormsPrefs");

  return {
    multicurrency: bool(currency?.MultiCurrencyEnabled),
    homeCurrency: refValue(currency?.HomeCurrency),
    usingSalesTax: bool(tax?.UsingSalesTax),
    automatedSalesTax: bool(tax?.PartnerTaxEnabled),
    customTransactionNumbers: bool(salesForms?.CustomTxnNumbers),
    defaultTermId: refValue(salesForms?.DefaultTerms),
  };
}

/**
 * The connected company's capabilities, probed once per realm and cached.
 * Keyed "self" because the realm is already the cache key's prefix.
 */
export async function companyCapabilities(): Promise<CompanyCapabilities> {
  return cachedEntity("preferences", "self", async () => readCapabilities(await getPreferencesForTenant()));
}

/**
 * Capabilities, or null when the probe failed.
 *
 * A failed probe must not fail a write that did not depend on it — but it must
 * also not be treated as "everything is supported". Callers use null to mean
 * "unknown" and refuse only the arguments whose validity they cannot establish.
 */
export async function companyCapabilitiesOrNull(): Promise<CompanyCapabilities | null> {
  try {
    return await companyCapabilities();
  } catch {
    return null;
  }
}
