import { getQuickbooks } from "../clients/quickbooks-client.js";
import { ToolResponse } from "../types/tool-response.js";
import { formatError } from "../helpers/format-error.js";

export interface AgedPayablesOptions {
  report_date?: string;
  vendor?: string;
  aging_method?: "Current" | "Report_Date";
  days_per_aging_period?: number;
  num_periods?: number;
}

export async function getQuickbooksAgedPayables(options: AgedPayablesOptions): Promise<ToolResponse<any>> {
  try {
    const quickbooks = await getQuickbooks();
    const params: Record<string, any> = {};
    if (options.report_date) params.report_date = options.report_date;
    if (options.vendor) params.vendor = options.vendor;
    if (options.aging_method) params.aging_method = options.aging_method;
    if (options.days_per_aging_period) params.days_per_aging_period = options.days_per_aging_period;
    if (options.num_periods) params.num_periods = options.num_periods;

    return new Promise((resolve) => {
      (quickbooks as any).reportAgedPayables(params, (err: any, report: any) => {
        if (err) resolve({ result: null, isError: true, error: formatError(err) });
        else resolve({ result: report, isError: false, error: null });
      });
    });
  } catch (error) {
    return { result: null, isError: true, error: formatError(error) };
  }
}
