import { QuickbooksClient } from "../clients/quickbooks-client.js";
import { ToolResponse } from "../types/tool-response.js";
import { formatError } from "../helpers/format-error.js";
import { promisify, runConfirmedAction, summarizeRecord } from "../helpers/confirm-flow.js";

/**
 * Permanently delete a time activity (two-step: summary + code, then delete).
 */
export async function deleteQuickbooksTimeActivity(input: {
  id: string;
  confirmation_code?: string;
}): Promise<ToolResponse<any>> {
  try {
    const quickbooks: any = await QuickbooksClient.getInstance();
    return runConfirmedAction({
      entity: "timeActivity",
      id: input.id,
      confirmationCode: input.confirmation_code,
      action: "delete",
      fetch: (id) => promisify((cb) => quickbooks.getTimeActivity(id, cb)),
      summarize: (r) => summarizeRecord("Time activity", r, "permanently deleted"),
      perform: (r) => promisify((cb) => quickbooks.deleteTimeActivity(r, cb)),
    });
  } catch (error) {
    return { result: null, isError: true, error: formatError(error) };
  }
}
