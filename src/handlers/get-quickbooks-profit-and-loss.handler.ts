import { getQuickbooks } from "../clients/quickbooks-client.js";
import { ToolResponse } from "../types/tool-response.js";
import { formatError } from "../helpers/format-error.js";

export interface ProfitAndLossOptions {
  start_date?: string;
  end_date?: string;
  accounting_method?: "Cash" | "Accrual";
  summarize_column_by?: "Total" | "Month" | "Week" | "Days";
  customer?: string;
  vendor?: string;
  item?: string;
  department?: string;
  class?: string;
}

export async function getQuickbooksProfitAndLoss(options: ProfitAndLossOptions): Promise<ToolResponse<any>> {
  try {
    const quickbooks = await getQuickbooks();
    const params: Record<string, any> = {};
    if (options.start_date) params.start_date = options.start_date;
    if (options.end_date) params.end_date = options.end_date;
    if (options.accounting_method) params.accounting_method = options.accounting_method;
    if (options.summarize_column_by) params.summarize_column_by = options.summarize_column_by;
    if (options.customer) params.customer = options.customer;
    if (options.vendor) params.vendor = options.vendor;
    if (options.item) params.item = options.item;
    if (options.department) params.department = options.department;
    if (options.class) params.class = options.class;

    return new Promise((resolve) => {
      (quickbooks as any).reportProfitAndLoss(params, (err: any, report: any) => {
        if (err) resolve({ result: null, isError: true, error: formatError(err) });
        else resolve({ result: report, isError: false, error: null });
      });
    });
  } catch (error) {
    return { result: null, isError: true, error: formatError(error) };
  }
}
