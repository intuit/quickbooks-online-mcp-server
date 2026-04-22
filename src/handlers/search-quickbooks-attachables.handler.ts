import { QuickbooksClient } from "../clients/quickbooks-client.js";
import { ToolResponse } from "../types/tool-response.js";
import { formatError } from "../helpers/format-error.js";

/**
 * Search for attachables in QuickBooks Online
 * Can search by entity type and ID to find attachments linked to specific transactions
 */
export async function searchQuickbooksAttachables(criteria: any): Promise<ToolResponse<any>> {
  try {
    const quickbooks = await QuickbooksClient.getInstance();

    return new Promise((resolve) => {
      quickbooks.findAttachables(criteria, (err: any, result: any) => {
        if (err) {
          resolve({
            result: null,
            isError: true,
            error: formatError(err),
          });
        } else {
          const attachables = result?.QueryResponse?.Attachable || [];
          resolve({
            result: attachables,
            isError: false,
            error: null,
          });
        }
      });
    });
  } catch (error) {
    return {
      result: null,
      isError: true,
      error: formatError(error),
    };
  }
}
