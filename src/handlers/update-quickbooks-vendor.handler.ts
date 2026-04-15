import { getQuickbooks } from "../clients/quickbooks-client.js";
import { ToolResponse } from "../types/tool-response.js";
import { formatError } from "../helpers/format-error.js";

/**
 * Update a vendor in QuickBooks Online
 */
export async function updateQuickbooksVendor(vendor: any): Promise<ToolResponse<any>> {
  try {
    const quickbooks = await getQuickbooks();

    return new Promise((resolve) => {
      quickbooks.updateVendor(vendor, (err: any, updatedVendor: any) => {
        if (err) {
          resolve({
            result: null,
            isError: true,
            error: formatError(err),
          });
        } else {
          resolve({
            result: updatedVendor,
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