import { z } from "zod";

/**
 * The shape a caller describes a new invoice in, and how it becomes a QuickBooks
 * Invoice entity.
 *
 * Deliberately not "pass me an Invoice". A model handed the raw entity has to know
 * that a line needs both a DetailType discriminator and a nested
 * SalesItemLineDetail, that Amount is quantity times price but is also the field
 * QuickBooks trusts, and that a memo is `CustomerMemo.value` while a note is a bare
 * string. Every one of those is a silent-wrong-invoice waiting to happen, so the
 * tool takes flat, obvious arguments and assembles the entity here.
 */

/** A date QuickBooks accepts, checked here so it fails as an argument error. */
const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "must be a date as YYYY-MM-DD")
  .refine((value) => !Number.isNaN(Date.parse(value)), "must be a real calendar date");

const idSchema = z
  .string()
  .min(1)
  .max(32)
  .regex(/^[0-9]+$/, "must be a QuickBooks numeric id");

/** An invoice with hundreds of lines is a data import, not a chat action. */
const MAX_LINES = 50;

const lineSchema = z
  .object({
    item_id: idSchema.describe("Product or service id, from search_items."),
    quantity: z.number().positive().max(1_000_000).optional(),
    unit_price: z.number().min(0).max(100_000_000).optional(),
    amount: z
      .number()
      .min(0)
      .max(100_000_000)
      .optional()
      .describe("Line total. Omit to have it computed from quantity x unit_price."),
    description: z.string().min(1).max(4_000).optional(),
    tax_code_id: z
      .string()
      .min(1)
      .max(32)
      .optional()
      .describe("Tax code for this line, from search_tax_codes. Only meaningful if the company charges tax."),
  })
  .refine(
    (line) => line.amount !== undefined || (line.quantity !== undefined && line.unit_price !== undefined),
    "each line needs either amount, or both quantity and unit_price",
  );

export const invoiceDraftSchema = z.object({
  customer_id: idSchema.describe("Who to invoice, from search_customers."),
  lines: z.array(lineSchema).min(1).max(MAX_LINES),
  txn_date: dateSchema.optional().describe("Invoice date. Defaults to today in QuickBooks."),
  due_date: dateSchema.optional().describe("Payment due date. Derived from the term when omitted."),
  doc_number: z
    .string()
    .min(1)
    .max(21)
    .optional()
    .describe("Invoice number. Only accepted by companies that allow custom transaction numbers."),
  terms_id: idSchema.optional().describe("Payment term id, from search_terms."),
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/, "must be a three-letter currency code")
    .optional()
    .describe("Only accepted by companies with multicurrency turned on."),
  customer_memo: z.string().min(1).max(1_000).optional().describe("Message shown to the customer."),
  private_note: z.string().min(1).max(4_000).optional().describe("Internal note, not shown to the customer."),
  bill_email: z
    .string()
    .email()
    .max(320)
    .optional()
    .describe("Overrides the customer's own email for this invoice."),
  idempotency_key: z
    .string()
    .min(8)
    .max(128)
    .regex(/^[A-Za-z0-9._:-]+$/)
    .optional()
    .describe(
      "Supply to make retries provably safe. Two calls with the same key return the same invoice. " +
        "Omit and a key is derived from these arguments, which already collapses identical retries.",
    ),
});

export type InvoiceDraft = z.infer<typeof invoiceDraftSchema>;

function lineAmount(line: InvoiceDraft["lines"][number]): number {
  if (line.amount !== undefined) return line.amount;
  // The refinement above guarantees both are present when amount is absent.
  return Number(((line.quantity as number) * (line.unit_price as number)).toFixed(2));
}

/**
 * Builds the QuickBooks Invoice entity. Absent arguments are omitted entirely
 * rather than sent as null, because QuickBooks treats an explicit null on a create
 * as a value and a missing key as "use the company default".
 */
export function buildInvoiceEntity(draft: InvoiceDraft): Record<string, unknown> {
  const entity: Record<string, unknown> = {
    CustomerRef: { value: draft.customer_id },
    Line: draft.lines.map((line) => {
      const detail: Record<string, unknown> = { ItemRef: { value: line.item_id } };
      if (line.quantity !== undefined) detail.Qty = line.quantity;
      if (line.unit_price !== undefined) detail.UnitPrice = line.unit_price;
      if (line.tax_code_id !== undefined) detail.TaxCodeRef = { value: line.tax_code_id };
      const built: Record<string, unknown> = {
        DetailType: "SalesItemLineDetail",
        Amount: lineAmount(line),
        SalesItemLineDetail: detail,
      };
      if (line.description !== undefined) built.Description = line.description;
      return built;
    }),
  };

  if (draft.txn_date !== undefined) entity.TxnDate = draft.txn_date;
  if (draft.due_date !== undefined) entity.DueDate = draft.due_date;
  if (draft.doc_number !== undefined) entity.DocNumber = draft.doc_number;
  if (draft.terms_id !== undefined) entity.SalesTermRef = { value: draft.terms_id };
  if (draft.currency !== undefined) entity.CurrencyRef = { value: draft.currency };
  if (draft.customer_memo !== undefined) entity.CustomerMemo = { value: draft.customer_memo };
  if (draft.private_note !== undefined) entity.PrivateNote = draft.private_note;
  if (draft.bill_email !== undefined) entity.BillEmail = { Address: draft.bill_email };

  return entity;
}

/** Total the caller asked for, so an approval card can show it before firing. */
export function draftTotal(draft: InvoiceDraft): number {
  return Number(draft.lines.reduce((sum, line) => sum + lineAmount(line), 0).toFixed(2));
}
