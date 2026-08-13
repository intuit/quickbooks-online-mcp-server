import type { CompanyCapabilities } from "./preferences.js";

/**
 * Refuses invoice fields the connected company cannot honour.
 *
 * The point is not defensiveness for its own sake. Each of these fields fails
 * quietly rather than loudly when the company is not configured for it: a
 * currency on a single-currency company, a manual tax block on an Automated Sales
 * Tax company, a document number on a company that numbers its own invoices. In
 * every case QuickBooks accepts the request and returns an invoice that does not
 * say what the caller asked for — and a model reading that response back has no
 * way to tell. So the tools refuse up front and say why.
 */

export class UnsupportedForCompanyError extends Error {
  constructor(
    readonly field: string,
    message: string,
  ) {
    super(message);
    this.name = "UnsupportedForCompanyError";
  }
}

/** Fields whose validity depends on how the company is configured. */
const CURRENCY_FIELDS = ["CurrencyRef", "ExchangeRate"] as const;
const MANUAL_TAX_FIELD = "TxnTaxDetail";
const DOC_NUMBER_FIELD = "DocNumber";

function present(fields: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(fields, key) && fields[key] !== undefined;
}

/** True when any invoice line carries a tax code. */
function hasLineTaxCode(fields: Record<string, unknown>): boolean {
  const lines = fields.Line;
  if (!Array.isArray(lines)) return false;
  return lines.some((line) => {
    if (typeof line !== "object" || line === null) return false;
    const detail = (line as Record<string, unknown>).SalesItemLineDetail;
    if (typeof detail !== "object" || detail === null) return false;
    return (detail as Record<string, unknown>).TaxCodeRef !== undefined;
  });
}

/** Every conditional field this policy governs, for the unknown-capabilities case. */
function conditionalFieldsPresent(fields: Record<string, unknown>): string[] {
  const found = CURRENCY_FIELDS.filter((field) => present(fields, field)) as string[];
  if (present(fields, MANUAL_TAX_FIELD)) found.push(MANUAL_TAX_FIELD);
  if (present(fields, DOC_NUMBER_FIELD)) found.push(DOC_NUMBER_FIELD);
  if (hasLineTaxCode(fields)) found.push("Line[].SalesItemLineDetail.TaxCodeRef");
  return found;
}

/**
 * Throws on the first field the company cannot honour.
 *
 * `capabilities` is null when the probe failed. That is treated as "unknown", not
 * as "permitted": a field whose validity cannot be established is refused, while a
 * payload that uses none of them proceeds untouched.
 *
 * Complexity: O(fields + lines) with no requests of its own — the capabilities are
 * already resolved and cached by the caller.
 */
export function assertInvoiceFieldsSupported(
  fields: Record<string, unknown>,
  capabilities: CompanyCapabilities | null,
): void {
  if (capabilities === null) {
    const blocked = conditionalFieldsPresent(fields);
    if (blocked.length === 0) return;
    throw new UnsupportedForCompanyError(
      blocked[0] as string,
      `This company's settings could not be read, so ${blocked.join(", ")} cannot be applied safely. ` +
        "Nothing was written. Retry without those fields, or try again once QuickBooks is reachable.",
    );
  }

  for (const field of CURRENCY_FIELDS) {
    if (present(fields, field) && !capabilities.multicurrency) {
      throw new UnsupportedForCompanyError(
        field,
        `This company does not have multicurrency turned on, so ${field} cannot be set — QuickBooks would ` +
          `discard it and bill in ${capabilities.homeCurrency ?? "the company's own currency"}. Nothing was ` +
          "written. Remove it, or turn on multicurrency in QuickBooks first.",
      );
    }
  }

  if (present(fields, MANUAL_TAX_FIELD)) {
    if (!capabilities.usingSalesTax) {
      throw new UnsupportedForCompanyError(
        MANUAL_TAX_FIELD,
        "This company does not charge sales tax, so TxnTaxDetail has no effect. Nothing was written. " +
          "Remove it, or turn sales tax on in QuickBooks first.",
      );
    }
    if (capabilities.automatedSalesTax) {
      throw new UnsupportedForCompanyError(
        MANUAL_TAX_FIELD,
        "This company uses Automated Sales Tax, so QuickBooks calculates the tax itself and a supplied " +
          "TxnTaxDetail is ignored. Nothing was written. Remove it and set a TaxCodeRef on the lines that " +
          "should be taxed instead.",
      );
    }
  }

  if (hasLineTaxCode(fields) && !capabilities.usingSalesTax) {
    throw new UnsupportedForCompanyError(
      "Line[].SalesItemLineDetail.TaxCodeRef",
      "This company does not charge sales tax, so a line tax code has no effect. Nothing was written. " +
        "Remove it, or turn sales tax on in QuickBooks first.",
    );
  }

  if (present(fields, DOC_NUMBER_FIELD) && !capabilities.customTransactionNumbers) {
    throw new UnsupportedForCompanyError(
      DOC_NUMBER_FIELD,
      "This company numbers its own invoices (custom transaction numbers are off), so a supplied DocNumber " +
        "is discarded without an error. Nothing was written. Remove it, or turn on custom transaction " +
        "numbers in QuickBooks first.",
    );
  }
}

/** Plain-language summary for a model deciding what it may send. */
export function describeCapabilities(capabilities: CompanyCapabilities): Record<string, unknown> {
  return {
    multicurrency: capabilities.multicurrency,
    home_currency: capabilities.homeCurrency ?? null,
    sales_tax: capabilities.usingSalesTax
      ? capabilities.automatedSalesTax
        ? "automated — QuickBooks calculates tax; set TaxCodeRef on lines, never TxnTaxDetail"
        : "manual — set TxnTaxDetail and per-line TaxCodeRef yourself"
      : "off — no tax field on an invoice has any effect",
    invoice_numbering: capabilities.customTransactionNumbers
      ? "caller may set DocNumber"
      : "QuickBooks assigns DocNumber; a supplied one is discarded",
    default_term_id: capabilities.defaultTermId ?? null,
  };
}
