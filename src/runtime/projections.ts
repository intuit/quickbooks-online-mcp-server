import { invoiceAppUrl } from "./app-links.js";
import type { QboRow } from "./qbo-query-methods.js";

/**
 * Compact rows for search results.
 *
 * A QuickBooks invoice entity carries every line, every tax detail and a full
 * customer address block; twenty of them is a large payload to put in front of a
 * planner, and almost none of it helps choose which invoice to act on. So search
 * returns identifying and decision-relevant fields only, and the model reads the
 * one invoice it settles on in full through read_invoice.
 *
 * SyncToken is deliberately absent from every projection. Mutations read it
 * immediately before writing (see tools/update-invoice.tool.ts); a token that a
 * model carried from an earlier search would be exactly the stale value the
 * sparse update exists to avoid.
 */

/** Reads a dotted path without throwing on a missing intermediate. */
function at(row: QboRow, path: string): unknown {
  let value: unknown = row;
  for (const segment of path.split(".")) {
    if (typeof value !== "object" || value === null) return undefined;
    value = (value as Record<string, unknown>)[segment];
  }
  return value;
}

/**
 * Builds a projector for a field map. Absent fields are omitted rather than set
 * to null, so a row stays small and a missing value is not mistaken for a value.
 */
function projector(fields: Readonly<Record<string, string>>): (row: QboRow) => QboRow {
  const entries = Object.entries(fields);
  return (row) => {
    const projected: QboRow = {};
    for (const [outputKey, path] of entries) {
      const value = at(row, path);
      if (value !== undefined) projected[outputKey] = value;
    }
    return projected;
  };
}

export const projectInvoice = projector({
  id: "Id",
  doc_number: "DocNumber",
  txn_date: "TxnDate",
  due_date: "DueDate",
  total: "TotalAmt",
  balance: "Balance",
  currency: "CurrencyRef.value",
  customer_id: "CustomerRef.value",
  customer_name: "CustomerRef.name",
  email_status: "EmailStatus",
  print_status: "PrintStatus",
  // A voided invoice keeps its number but zeroes its total and is stamped in the
  // private note, so this is what tells a reader it is cancelled rather than paid.
  private_note: "PrivateNote",
  last_updated: "MetaData.LastUpdatedTime",
});

/**
 * An invoice as a caller should see it: the bounded projection plus a link to the record in
 * QuickBooks.
 *
 * Every tool that returns an invoice goes through here, so a reader gets the same handful of
 * fields each time and can always click through to check. Writes used to hand back the raw
 * QuickBooks entity — a hundred-odd fields of payment flags and sync tokens — which nobody
 * reads, costs the model context it could spend on the answer, and buries the four numbers
 * that matter.
 */
// Accepts `object` rather than QboRow so the mutation tools can pass their own typed
// entities, which describe named fields and therefore carry no index signature. The
// projector only ever reads paths, so a row that lacks a field yields no key for it.
export function describeInvoice(invoice: object): QboRow {
  const projected = projectInvoice(invoice as QboRow);
  const viewUrl = invoiceAppUrl(typeof projected.id === "string" ? projected.id : undefined);
  return viewUrl === undefined ? projected : { ...projected, view_url: viewUrl };
}

export const projectCustomer = projector({
  id: "Id",
  display_name: "DisplayName",
  company_name: "CompanyName",
  email: "PrimaryEmailAddr.Address",
  phone: "PrimaryPhone.FreeFormNumber",
  balance: "Balance",
  currency: "CurrencyRef.value",
  active: "Active",
  // Present when the company bills a parent account; changes who to invoice.
  bill_with_parent: "BillWithParent",
  parent_id: "ParentRef.value",
});

export const projectItem = projector({
  id: "Id",
  name: "Name",
  sku: "Sku",
  type: "Type",
  unit_price: "UnitPrice",
  description: "Description",
  taxable: "Taxable",
  sales_tax_code_id: "SalesTaxCodeRef.value",
  income_account_id: "IncomeAccountRef.value",
  active: "Active",
});

export const projectTerm = projector({
  id: "Id",
  name: "Name",
  due_days: "DueDays",
  discount_percent: "DiscountPercent",
  discount_days: "DiscountDays",
  day_of_month_due: "DayOfMonthDue",
  active: "Active",
});

export const projectTaxCode = projector({
  id: "Id",
  name: "Name",
  description: "Description",
  taxable: "Taxable",
  tax_group: "TaxGroup",
  active: "Active",
});

export const projectCompanyInfo = projector({
  id: "Id",
  company_name: "CompanyName",
  legal_name: "LegalName",
  country: "Country",
  email: "Email.Address",
  fiscal_year_start_month: "FiscalYearStartMonth",
  company_start_date: "CompanyStartDate",
  city: "CompanyAddr.City",
  region: "CompanyAddr.CountrySubDivisionCode",
  postal_code: "CompanyAddr.PostalCode",
});
