import { QuickbooksClient } from "../clients/quickbooks-client.js";
import { ToolResponse } from "../types/tool-response.js";
import { formatError } from "../helpers/format-error.js";
import { promisify, runConfirmedAction, summarizeRecord } from "../helpers/confirm-flow.js";

/**
 * Void a refund receipt (two-step: summary + code, then update with void:true,
 * which node-quickbooks sends as operation=update&include=void). Never hard-deletes.
 */
export async function deleteQuickbooksRefundReceipt(input: {
  id: string;
  confirmation_code?: string;
}): Promise<ToolResponse<any>> {
  try {
    const quickbooks: any = await QuickbooksClient.getInstance();
    return runConfirmedAction({
      entity: "refundReceipt",
      id: input.id,
      confirmationCode: input.confirmation_code,
      action: "void",
      fetch: (id) => promisify((cb) => quickbooks.getRefundReceipt(id, cb)),
      summarize: (r) => summarizeRecord("Refund receipt", r, "voided"),
      perform: (r) =>
        promisify((cb) =>
          quickbooks.updateRefundReceipt({ Id: r.Id, SyncToken: r.SyncToken, sparse: true, void: true }, cb),
        ),
    });
  } catch (error) {
    return { result: null, isError: true, error: formatError(error) };
  }
}
