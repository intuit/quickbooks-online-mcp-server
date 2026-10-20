import { QuickbooksClient } from "../clients/quickbooks-client.js";
import { ToolResponse } from "../types/tool-response.js";
import { formatError } from "../helpers/format-error.js";

/**
 * Delete (make inactive) a vendor in QuickBooks Online.
 *
 * QuickBooks Online does not support deleting a Vendor, and node-quickbooks has
 * no deleteVendor method. A vendor is removed by setting Active to false with a
 * sparse update, the same way customers, items and employees are handled.
 */
export async function deleteQuickbooksVendor(vendor: any): Promise<ToolResponse<any>> {
  try {
    const quickbooks = await QuickbooksClient.getInstance();

    const inactiveVendor = {
      Id: vendor.Id,
      SyncToken: vendor.SyncToken,
      Active: false,
      sparse: true,
    };

    return new Promise((resolve) => {
      quickbooks.updateVendor(inactiveVendor, (err: any, updatedVendor: any) => {
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
