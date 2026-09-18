import { QuickbooksClient } from "../clients/quickbooks-client.js";
import { ToolResponse } from "../types/tool-response.js";
import { formatError } from "../helpers/format-error.js";
import { normalizePayloadGlobalTax } from "../helpers/global-tax.js";

/**
 * Create a bill in QuickBooks Online
 */
export async function createQuickbooksBill(bill: any): Promise<ToolResponse<any>> {
  try {
    const quickbooks = await QuickbooksClient.getInstance();

    // Normalize GlobalTaxCalculation (maps the common "TaxExclusive"
    // misspelling to "TaxExcluded"; rejects unknown values with a clear error
    // instead of QBO's opaque parse fault).
    normalizePayloadGlobalTax(bill);

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
