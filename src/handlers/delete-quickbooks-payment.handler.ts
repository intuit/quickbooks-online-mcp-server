import { QuickbooksClient } from "../clients/quickbooks-client.js";
import { ToolResponse } from "../types/tool-response.js";
import { formatError } from "../helpers/format-error.js";
import { promisify, runConfirmedAction, summarizeRecord } from "../helpers/confirm-flow.js";

/**
 * Void a payment (two-step: summary + code, then void). Never hard-deletes.
 */
export async function deleteQuickbooksPayment(input: {
  id: string;
  confirmation_code?: string;
}): Promise<ToolResponse<any>> {
  try {
    const quickbooks: any = await QuickbooksClient.getInstance();
    return runConfirmedAction({
      entity: "payment",
      id: input.id,
      confirmationCode: input.confirmation_code,
      action: "void",
      fetch: (id) => promisify((cb) => quickbooks.getPayment(id, cb)),
      summarize: (r) => summarizeRecord("Payment", r, "voided"),
      perform: (r) =>
        promisify((cb) => quickbooks.voidPayment({ Id: r.Id, SyncToken: r.SyncToken }, cb)),
    });
  } catch (error) {
    return { result: null, isError: true, error: formatError(error) };
  }
}
