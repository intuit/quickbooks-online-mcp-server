import { getQuickbooks } from "../clients/quickbooks-client.js";
import { ToolResponse } from "../types/tool-response.js";
import { formatError } from "../helpers/format-error.js";

export interface VendorBalanceOptions {
  report_date?: string;
  vendor?: string;
  summarize_column_by?: "Total" | "Month" | "Week" | "Days";
}

export async function getQuickbooksVendorBalance(options: VendorBalanceOptions): Promise<ToolResponse<any>> {
  try {
    const quickbooks = await getQuickbooks();
    const params: Record<string, any> = {};
    if (options.report_date) params.report_date = options.report_date;
    if (options.vendor) params.vendor = options.vendor;
    if (options.summarize_column_by) params.summarize_column_by = options.summarize_column_by;

    return new Promise((resolve) => {
      (quickbooks as any).reportVendorBalance(params, (err: any, report: any) => {
        if (err) resolve({ result: null, isError: true, error: formatError(err) });
        else resolve({ result: report, isError: false, error: null });
      });
    });
  } catch (error) {
    return { result: null, isError: true, error: formatError(error) };
  }
}
