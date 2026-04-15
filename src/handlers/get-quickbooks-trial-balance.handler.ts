import { getQuickbooks } from "../clients/quickbooks-client.js";
import { ToolResponse } from "../types/tool-response.js";
import { formatError } from "../helpers/format-error.js";

export interface TrialBalanceOptions {
  start_date?: string;
  end_date?: string;
  accounting_method?: "Cash" | "Accrual";
}

export async function getQuickbooksTrialBalance(options: TrialBalanceOptions): Promise<ToolResponse<any>> {
  try {
    const quickbooks = await getQuickbooks();
    const params: Record<string, any> = {};
    if (options.start_date) params.start_date = options.start_date;
    if (options.end_date) params.end_date = options.end_date;
    if (options.accounting_method) params.accounting_method = options.accounting_method;

    return new Promise((resolve) => {
      (quickbooks as any).reportTrialBalance(params, (err: any, report: any) => {
        if (err) resolve({ result: null, isError: true, error: formatError(err) });
        else resolve({ result: report, isError: false, error: null });
      });
    });
  } catch (error) {
    return { result: null, isError: true, error: formatError(error) };
  }
}
