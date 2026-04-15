import { getQuickbooks } from "../clients/quickbooks-client.js";
import { ToolResponse } from "../types/tool-response.js";
import { formatError } from "../helpers/format-error.js";

export interface SearchRefundReceiptsInput {
  customer_ref?: string;
  txn_date_from?: string;
  txn_date_to?: string;
  limit?: number;
}

export async function searchQuickbooksRefundReceipts(data: SearchRefundReceiptsInput): Promise<ToolResponse<any>> {
  try {
    const quickbooks = await getQuickbooks();

    const criteria: Record<string, any> = {};

    if (data.customer_ref) {
      criteria.CustomerRef = data.customer_ref;
    }
    if (data.txn_date_from) {
      criteria.TxnDate = { $gte: data.txn_date_from };
    }
    if (data.txn_date_to) {
      criteria.TxnDate = { ...criteria.TxnDate, $lte: data.txn_date_to };
    }
    if (data.limit) {
      criteria.limit = data.limit;
    }

    return new Promise((resolve) => {
      (quickbooks as any).findRefundReceipts(criteria, (err: any, result: any) => {
        if (err) {
          resolve({ result: null, isError: true, error: formatError(err) });
        } else {
          const receipts = result?.QueryResponse?.RefundReceipt || [];
          resolve({ result: receipts, isError: false, error: null });
        }
      });
    });
  } catch (error) {
    return { result: null, isError: true, error: formatError(error) };
  }
}
