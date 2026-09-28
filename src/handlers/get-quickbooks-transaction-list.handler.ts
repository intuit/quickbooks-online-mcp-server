import { QuickbooksClient } from "../clients/quickbooks-client.js";
import { ToolResponse } from "../types/tool-response.js";
import { formatError } from "../helpers/format-error.js";

export interface TransactionListOptions {
  start_date: string;
  end_date?: string;
  vendor?: string;
  customer?: string;
  group_by?: string;
  transaction_type?: string;
}

/**
 * Get the Transaction List report from QuickBooks. Unlike the entity query
 * language (which cannot filter transactions on vendor/customer references),
 * the report service supports server-side vendor and customer filters across
 * all transaction types.
 */
export async function getQuickbooksTransactionList(options: TransactionListOptions): Promise<ToolResponse<any>> {
  try {
    const quickbooks = await QuickbooksClient.getInstance();
    const params: Record<string, any> = {};
    if (options.start_date) params.start_date = options.start_date;
    if (options.end_date) params.end_date = options.end_date;
    if (options.vendor) params.vendor = options.vendor;
    if (options.customer) params.customer = options.customer;
    if (options.group_by) params.group_by = options.group_by;
    if (options.transaction_type) params.transaction_type = options.transaction_type;

    return new Promise((resolve) => {
      quickbooks.reportTransactionList(params, (err: any, report: any) => {
        if (err) resolve({ result: null, isError: true, error: formatError(err) });
        else resolve({ result: report, isError: false, error: null });
      });
    });
  } catch (error) {
    return { result: null, isError: true, error: formatError(error) };
  }
}
