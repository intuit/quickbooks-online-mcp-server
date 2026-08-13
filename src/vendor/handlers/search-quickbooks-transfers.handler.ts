import { QuickbooksClient } from "../clients/quickbooks-client.js";
import { ToolResponse } from "../types/tool-response.js";
import { formatError } from "../helpers/format-error.js";

export interface SearchTransfersInput {
  txn_date_from?: string;
  txn_date_to?: string;
  limit?: number;
}

export async function searchQuickbooksTransfers(data: SearchTransfersInput): Promise<ToolResponse<any>> {
  try {
    const quickbooks = await QuickbooksClient.getInstance();
    const criteria: Array<Record<string, any>> = [];
    if (data.txn_date_from) criteria.push({ field: "TxnDate", value: data.txn_date_from, operator: ">=" });
    if (data.txn_date_to) criteria.push({ field: "TxnDate", value: data.txn_date_to, operator: "<=" });
    if (data.limit) criteria.push({ field: "limit", value: data.limit });

    return new Promise((resolve) => {
      (quickbooks as any).findTransfers(criteria, (err: any, result: any) => {
        if (err) resolve({ result: null, isError: true, error: formatError(err) });
        else resolve({ result: result?.QueryResponse?.Transfer || [], isError: false, error: null });
      });
    });
  } catch (error) {
    return { result: null, isError: true, error: formatError(error) };
  }
}

