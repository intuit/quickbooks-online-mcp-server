/**
 * Amounts as money, for the sentences a person reads.
 *
 * A bare `450` in "Invoice 1044 created for 450." reads like a quantity, not a charge, and the
 * reader has to supply the currency from memory. Two decimal places and the company's own
 * currency code make the number unambiguous without pretending to know the right symbol for
 * every currency QuickBooks supports.
 */
export function formatMoney(amount: number, currency?: unknown): string {
  const formatted = amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return typeof currency === "string" && /^[A-Z]{3}$/.test(currency) ? `${formatted} ${currency}` : formatted;
}
