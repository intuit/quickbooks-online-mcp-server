import { z } from "zod";
import { formatError } from "../qbo-error.js";
import { voidInvoiceById } from "../qbo-invoice-methods.js";
import type { AnyToolDefinition } from "../tool-allowlist.js";
import { describeInvoice } from "../projections.js";
import { formatMoney } from "../money.js";

/**
 * Voiding is the only cancellation this service exposes.
 *
 * Upstream has no void tool. Its delete_invoice handler attempts a genuine hard
 * delete and only falls back to voiding when that fails, which destroys an
 * accounting record — so delete is not on the allowlist and this takes its place.
 * A voided invoice keeps its number and audit trail with all amounts zeroed and
 * "Voided" appended to its private note, which is what an accountant expects and
 * what a hard delete makes impossible.
 *
 * SyncToken is handled by passing the id rather than an entity: node-quickbooks
 * then reads the current invoice and posts that, so the void always carries a
 * fresh SyncToken instead of one the caller guessed.
 */
const toolSchema = z.object({
  invoice_id: z
    .string()
    .min(1)
    .regex(/^[0-9]+$/, "invoice_id must be a QuickBooks numeric id")
    .describe("Id of the invoice to void. Voiding zeroes the amounts but keeps the record."),
});

interface VoidableInvoice {
  Id?: string;
  DocNumber?: string;
  TotalAmt?: number;
  Balance?: number;
  PrivateNote?: string;
  SyncToken?: string;
}

const toolHandler = async ({ params }: { params: z.infer<typeof toolSchema> }) => {
  try {
    const voided = await voidInvoiceById<VoidableInvoice>(params.invoice_id);
    return {
      content: [
        {
          type: "text" as const,
          text:
            `Invoice ${voided.DocNumber ?? params.invoice_id} voided. ` +
            `Its total and balance are now ${formatMoney(0)}. ` +
            "The invoice stays in QuickBooks so the record remains auditable; it is not deleted.",
        },
        { type: "text" as const, text: JSON.stringify(describeInvoice(voided)) },
      ],
    };
  } catch (error) {
    return { content: [{ type: "text" as const, text: `Error voiding invoice: ${formatError(error)}` }] };
  }
};

export const VoidInvoiceTool: AnyToolDefinition = {
  name: "void_invoice",
  description:
    "Void an invoice in QuickBooks Online. Zeroes all amounts and quantities while keeping the " +
    "invoice and its audit trail. This is the correct way to cancel an invoice; it cannot be undone.",
  schema: toolSchema,
  handler: toolHandler,
} as unknown as AnyToolDefinition;
