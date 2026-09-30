import { ToolResponse } from "../types/tool-response.js";
import { sendTransactionPdf, SendTransactionOptions } from "../helpers/send-transaction-pdf.js";

/**
 * Email an estimate PDF to the customer from QuickBooks Online via
 * node-quickbooks `sendEstimatePdf` (POST /estimate/{id}/send[?sendTo=]).
 * On success QBO sets the estimate's EmailStatus to EmailSent.
 */
export async function sendQuickbooksEstimate(
  estimateId: string,
  options: SendTransactionOptions = {}
): Promise<ToolResponse<any>> {
  return sendTransactionPdf(
    { label: "Estimate", getMethod: "getEstimate", sendMethod: "sendEstimatePdf" },
    estimateId,
    options
  );
}
