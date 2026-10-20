import { QuickbooksClient } from "../clients/quickbooks-client.js";
import { ToolResponse } from "../types/tool-response.js";
import { formatError } from "../helpers/format-error.js";
import { promisify, runConfirmedAction, summarizeRecord } from "../helpers/confirm-flow.js";

/**
 * Void an invoice (two-step: summary + code, then void). Never hard-deletes.
 */
export async function deleteQuickbooksInvoice(input: {
  id: string;
  confirmation_code?: string;
}): Promise<ToolResponse<any>> {
  try {
    const quickbooks: any = await QuickbooksClient.getInstance();
    return runConfirmedAction({
      entity: "invoice",
      id: input.id,
      confirmationCode: input.confirmation_code,
      action: "void",
      fetch: (id) => promisify((cb) => quickbooks.getInvoice(id, cb)),
      summarize: (r) => summarizeRecord("Invoice", r, "voided"),
      perform: (r) =>
        promisify((cb) =>
          quickbooks.voidInvoice({ Id: r.Id, SyncToken: r.SyncToken, sparse: true }, cb),
        ),
    });
  } catch (error) {
    return { result: null, isError: true, error: formatError(error) };
  }
}
