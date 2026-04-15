import { getQuickbooks } from "../clients/quickbooks-client.js";
import { ToolResponse } from "../types/tool-response.js";
import { formatError } from "../helpers/format-error.js";

export interface VendorExpensesOptions {
  start_date?: string;
  end_date?: string;
  vendor?: string;
  summarize_column_by?: "Total" | "Month" | "Week" | "Days";
  accounting_method?: "Cash" | "Accrual";
}

export async function getQuickbooksVendorExpenses(options: VendorExpensesOptions): Promise<ToolResponse<any>> {
  try {
    const quickbooks = await getQuickbooks();
    const params: Record<string, any> = {};
    if (options.start_date) params.start_date = options.start_date;
    if (options.end_date) params.end_date = options.end_date;
    if (options.vendor) params.vendor = options.vendor;
    if (options.summarize_column_by) params.summarize_column_by = options.summarize_column_by;
    if (options.accounting_method) params.accounting_method = options.accounting_method;

    return new Promise((resolve) => {
      (quickbooks as any).reportVendorExpenses(params, (err: any, report: any) => {
        if (err) resolve({ result: null, isError: true, error: formatError(err) });
        else resolve({ result: report, isError: false, error: null });
      });
    });
  } catch (error) {
    return { result: null, isError: true, error: formatError(error) };
  }
}
