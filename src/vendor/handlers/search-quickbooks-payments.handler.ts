import { QuickbooksClient } from "../clients/quickbooks-client.js";
import { ToolResponse } from "../types/tool-response.js";
import { formatError } from "../helpers/format-error.js";

export interface SearchPaymentsInput {
  customer_ref?: string;
  txn_date_from?: string;
  txn_date_to?: string;
  limit?: number;
}

export async function searchQuickbooksPayments(data: SearchPaymentsInput): Promise<ToolResponse<any>> {
  try {
    const quickbooks = await QuickbooksClient.getInstance();

    const criteria: Array<Record<string, any>> = [];

    if (data.customer_ref) {
      criteria.push({ field: "CustomerRef", value: data.customer_ref, operator: "=" });
    }
    if (data.txn_date_from) {
      criteria.push({ field: "TxnDate", value: data.txn_date_from, operator: ">=" });
    }
    if (data.txn_date_to) {
      criteria.push({ field: "TxnDate", value: data.txn_date_to, operator: "<=" });
    }
    if (data.limit) {
      criteria.push({ field: "limit", value: data.limit });
    }

    return new Promise((resolve) => {
      (quickbooks as any).findPayments(criteria, (err: any, result: any) => {
        if (err) {
          resolve({ result: null, isError: true, error: formatError(err) });
        } else {
          const payments = result?.QueryResponse?.Payment || [];
          resolve({ result: payments, isError: false, error: null });
        }
      });
    });
  } catch (error) {
    return { result: null, isError: true, error: formatError(error) };
  }
}

