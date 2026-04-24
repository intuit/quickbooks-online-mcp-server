import { quickbooksClient } from "../clients/quickbooks-client.js";
import { ToolResponse } from "../types/tool-response.js";
import { formatError } from "../helpers/format-error.js";

/**
 * Create a bill in QuickBooks Online
 */
export async function createQuickbooksBill(bill: any): Promise<ToolResponse<any>> {
  try {
    await quickbooksClient.authenticate();
    const quickbooks = quickbooksClient.getQuickbooks();

    // Auto-nest flat line items into QBO's expected nested structure.
    // If caller sends AccountRef at line level (legacy shape), move it under AccountBasedExpenseLineDetail.
    const reshapedBill = {
      ...bill,
      Line: (bill.Line || []).map((line: any) => {
        if (line.AccountBasedExpenseLineDetail || line.ItemBasedExpenseLineDetail) {
          return line; // already properly structured
        }
        if (line.AccountRef) {
          const { AccountRef, ...rest } = line;
          return {
            ...rest,
            AccountBasedExpenseLineDetail: { AccountRef },
          };
        }
        return line;
      }),
    };

    return new Promise((resolve) => {
      quickbooks.createBill(reshapedBill, (err: any, createdBill: any) => {
        if (err) {
          resolve({
            result: null,
            isError: true,
            error: formatError(err),
          });
        } else {
          resolve({
            result: createdBill,
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