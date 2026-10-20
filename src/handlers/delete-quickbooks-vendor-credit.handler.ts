import { QuickbooksClient } from "../clients/quickbooks-client.js";
import { ToolResponse } from "../types/tool-response.js";
import { formatError } from "../helpers/format-error.js";
import { promisify, runConfirmedAction, summarizeRecord } from "../helpers/confirm-flow.js";

/**
 * Permanently delete a vendor credit (two-step: summary + code, then delete).
 */
export async function deleteQuickbooksVendorCredit(input: {
  id: string;
  confirmation_code?: string;
}): Promise<ToolResponse<any>> {
  try {
    const quickbooks: any = await QuickbooksClient.getInstance();
    return runConfirmedAction({
      entity: "vendorCredit",
      id: input.id,
      confirmationCode: input.confirmation_code,
      action: "delete",
      fetch: (id) => promisify((cb) => quickbooks.getVendorCredit(id, cb)),
      summarize: (r) => summarizeRecord("Vendor credit", r, "permanently deleted"),
      perform: (r) => promisify((cb) => quickbooks.deleteVendorCredit(r, cb)),
    });
  } catch (error) {
    return { result: null, isError: true, error: formatError(error) };
  }
}
