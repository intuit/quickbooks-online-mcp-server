import { quickbooksClient } from "../clients/quickbooks-client.js";
import { ToolResponse } from "../types/tool-response.js";
import { formatError } from "../helpers/format-error.js";
import { buildQuickbooksSearchCriteria } from "../helpers/build-quickbooks-search-criteria.js";

/**
 * Search purchases in QuickBooks Online that match given criteria
 */
export async function searchQuickbooksPurchases(params: any): Promise<ToolResponse<any>> {
  try {
    await quickbooksClient.authenticate();
    const quickbooks = quickbooksClient.getQuickbooks();

    const criteria = buildQuickbooksSearchCriteria(params);

    return new Promise((resolve) => {
      quickbooks.findPurchases(criteria, (err: any, purchases: any) => {
        if (err) {
          resolve({
            result: null,
            isError: true,
            error: formatError(err),
          });
        } else {
          resolve({
            result: purchases?.QueryResponse?.Purchase || [],
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