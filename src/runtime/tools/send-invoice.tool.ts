import { z } from "zod";
import { formatError } from "../qbo-error.js";
import { getInvoiceById, sendInvoicePdfTo } from "../qbo-invoice-methods.js";
import type { AnyToolDefinition } from "../tool-allowlist.js";

/**
 * Emails an invoice to a customer. Upstream has no send tool.
 *
 * This is the only tool here that reaches a third party who never spoke to the
 * bot, and it cannot be recalled. Two deliberate consequences:
 *
 *  - the recipient is a required argument rather than defaulting to the address
 *    on the invoice, so the approval prompt and the audit record both name who
 *    is about to be emailed. Callers wanting the stored address can read the
 *    invoice first: read_invoice returns BillEmail.
 *  - it is classified HIGH_RISK in the allowlist, so the calling API gates it
 *    behind explicit approval rather than ordinary write approval.
 *
 * `expected_total` is required for the same reason, and it is checked rather than
 * merely displayed. An approval card has to show the amount about to be billed, and
 * the only amount the API can put on that card is the one the caller supplied — so
 * if that figure were never verified, an approver could confirm one number while a
 * different one went to the customer. Comparing it against the invoice immediately
 * before sending closes that, and also catches the case where the invoice changed
 * between the planner reading it and the human approving.
 *
 * QuickBooks also marks the invoice as sent (EmailStatus) as a side effect, which
 * is why this is a write even though it creates nothing.
 */

/** Currency, so a rounding difference is not treated as a changed invoice. */
const TOTAL_TOLERANCE = 0.005;

const toolSchema = z.object({
  invoice_id: z
    .string()
    .min(1)
    .regex(/^[0-9]+$/, "invoice_id must be a QuickBooks numeric id")
    .describe("Id of the invoice to email."),
  send_to: z
    .string()
    .min(3)
    .max(320)
    .email("send_to must be a single valid email address")
    .describe(
      "Recipient email address. Required so the approval prompt names who will be emailed; " +
        "read_invoice returns the customer's BillEmail if you need the address on file.",
    ),
  expected_total: z
    .number()
    .min(0)
    .max(100_000_000)
    .describe(
      "The invoice total you believe you are sending, from read_invoice. Shown on the approval card and " +
        "checked against the invoice before the email goes out; if it no longer matches, nothing is sent.",
    ),
});

interface SentInvoice {
  Id?: string;
  DocNumber?: string;
  TotalAmt?: number;
  EmailStatus?: string;
  BillEmail?: { Address?: string };
}

const toolHandler = async ({ params }: { params: z.infer<typeof toolSchema> }) => {
  try {
    // Read first: the amount an approver was shown must be the amount the customer
    // is about to receive, and this is the last moment that can still be true.
    const current = await getInvoiceById<SentInvoice>(params.invoice_id);
    const actualTotal = current?.TotalAmt;
    if (typeof actualTotal !== "number") {
      return text(
        `Invoice ${params.invoice_id} did not return a total, so the amount about to be emailed could not ` +
          "be confirmed. Nothing was sent.",
      );
    }
    if (Math.abs(actualTotal - params.expected_total) > TOTAL_TOLERANCE) {
      return text(
        `Invoice ${current.DocNumber ?? params.invoice_id} is now ${actualTotal}, not the ${params.expected_total} ` +
          "this send was approved for, so nothing was sent. Read the invoice again and confirm the new amount " +
          "before emailing it.",
      );
    }

    const sent = await sendInvoicePdfTo<SentInvoice>(params.invoice_id, params.send_to);
    return {
      content: [
        {
          type: "text" as const,
          text:
            `Invoice ${sent.DocNumber ?? params.invoice_id} emailed to ${params.send_to}. ` +
            `Amount ${sent.TotalAmt ?? "unknown"}. QuickBooks status: ${sent.EmailStatus ?? "unknown"}.`,
        },
      ],
    };
  } catch (error) {
    return text(`Error sending invoice: ${formatError(error)}`);
  }
};

function text(message: string): { content: Array<{ type: "text"; text: string }> } {
  return { content: [{ type: "text" as const, text: message }] };
}

export const SendInvoiceTool: AnyToolDefinition = {
  name: "send_invoice",
  description:
    "Email an invoice PDF to a named recipient from QuickBooks Online. This contacts a customer directly " +
    "and cannot be undone. Read the invoice first: both the recipient address and the invoice total are " +
    "required, and the total is re-checked against the invoice before anything is sent.",
  schema: toolSchema,
  handler: toolHandler,
} as unknown as AnyToolDefinition;
