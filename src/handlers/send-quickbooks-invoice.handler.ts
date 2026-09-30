import { ToolResponse } from "../types/tool-response.js";
import { sendTransactionPdf, SendTransactionOptions } from "../helpers/send-transaction-pdf.js";

/**
 * Email an invoice PDF to the customer from QuickBooks Online via
 * node-quickbooks `sendInvoicePdf` (POST /invoice/{id}/send[?sendTo=]).
 * On success QBO sets the invoice's EmailStatus to EmailSent.
 */
export async function sendQuickbooksInvoice(
  invoiceId: string,
  options: SendTransactionOptions = {}
): Promise<ToolResponse<any>> {
  return sendTransactionPdf(
    { label: "Invoice", getMethod: "getInvoice", sendMethod: "sendInvoicePdf" },
    invoiceId,
    options
  );
}
