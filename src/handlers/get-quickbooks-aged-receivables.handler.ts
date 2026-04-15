import { getQuickbooks } from "../clients/quickbooks-client.js";
import { ToolResponse } from "../types/tool-response.js";
import { formatError } from "../helpers/format-error.js";

export interface AgedReceivablesOptions {
  report_date?: string;
  customer?: string;
  aging_method?: "Current" | "Report_Date";
  days_per_aging_period?: number;
  num_periods?: number;
}

export async function getQuickbooksAgedReceivables(options: AgedReceivablesOptions): Promise<ToolResponse<any>> {
  try {
    const quickbooks = await getQuickbooks();
    const params: Record<string, any> = {};
    if (options.report_date) params.report_date = options.report_date;
    if (options.customer) params.customer = options.customer;
    if (options.aging_method) params.aging_method = options.aging_method;
    if (options.days_per_aging_period) params.days_per_aging_period = options.days_per_aging_period;
    if (options.num_periods) params.num_periods = options.num_periods;

    return new Promise((resolve) => {
      (quickbooks as any).reportAgedReceivables(params, (err: any, report: any) => {
        if (err) resolve({ result: null, isError: true, error: formatError(err) });
        else resolve({ result: report, isError: false, error: null });
      });
    });
  } catch (error) {
    return { result: null, isError: true, error: formatError(error) };
  }
}
