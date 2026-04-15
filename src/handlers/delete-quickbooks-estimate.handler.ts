import { getQuickbooks } from "../clients/quickbooks-client.js";
import { ToolResponse } from "../types/tool-response.js";
import { formatError } from "../helpers/format-error.js";

/**
 * Delete an estimate (void) in QuickBooks Online
 */
export async function deleteQuickbooksEstimate(idOrEntity: any): Promise<ToolResponse<any>> {
  try {
    const quickbooks = await getQuickbooks();

    return new Promise((resolve) => {
      quickbooks.deleteEstimate(idOrEntity, (err: any, response: any) => {
        if (err) {
          resolve({
            result: null,
            isError: true,
            error: formatError(err),
          });
        } else {
          resolve({
            result: response,
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