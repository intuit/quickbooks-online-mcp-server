import { QuickbooksClient } from "../clients/quickbooks-client.js";
import { ToolResponse } from "../types/tool-response.js";
import { formatError } from "../helpers/format-error.js";
import { normalizePayloadGlobalTax } from "../helpers/global-tax.js";
import { mergeForFullUpdate, promisifyGetter } from "../helpers/read-merge-write.js";

/**
 * Update a purchase in QuickBooks Online
 * @param purchaseData The purchase object to update
 */
export async function updateQuickbooksPurchase(purchaseData: any): Promise<ToolResponse<any>> {
  try {
    const quickbooks = await QuickbooksClient.getInstance();
    normalizePayloadGlobalTax(purchaseData ?? {});

    // Read-merge-write: QBO's full-update semantics null omitted fields and
    // sparse updates are unreliable. Fetch the current entity, merge the
    // caller's changes over it, and send a complete payload.

    const merged = await mergeForFullUpdate(promisifyGetter(quickbooks, "getPurchase"), purchaseData);

    return new Promise((resolve) => {
      quickbooks.updatePurchase(merged, (err: any, purchase: any) => {
        if (err) {
          resolve({
            result: null,
            isError: true,
            error: formatError(err),
          });
        } else {
          resolve({
            result: purchase,
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
