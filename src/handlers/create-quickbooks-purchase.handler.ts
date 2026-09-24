import { QuickbooksClient } from "../clients/quickbooks-client.js";
import { ToolResponse } from "../types/tool-response.js";
import { formatError } from "../helpers/format-error.js";
import { normalizePayloadGlobalTax } from "../helpers/global-tax.js";

/**
 * Create a purchase in QuickBooks Online
 * @param purchaseData The purchase object to create
 */
export async function createQuickbooksPurchase(purchaseData: any): Promise<ToolResponse<any>> {
  try {
    const quickbooks = await QuickbooksClient.getInstance();

    // Forward GlobalTaxCalculation verbatim after normalizing the common
    // "TaxExclusive" misspelling — an invalid enum reaching QBO fails the
    // whole request with an opaque "Failed to parse json object" fault.
    normalizePayloadGlobalTax(purchaseData ?? {});

    return new Promise((resolve) => {
      quickbooks.createPurchase(purchaseData, (err: any, purchase: any) => {
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
