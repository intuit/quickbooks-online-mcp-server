import { quickbooksClient } from "../clients/quickbooks-client.js";
import { ToolResponse } from "../types/tool-response.js";
import { formatError } from "../helpers/format-error.js";

export interface GeneralLedgerOptions {
  start_date?: string;
  end_date?: string;
  accounting_method?: "Cash" | "Accrual";
  account?: string;
  source_account?: string;
  sort_by?: string;
}

export async function getQuickbooksGeneralLedger(options: GeneralLedgerOptions): Promise<ToolResponse<any>> {
  try {
    await quickbooksClient.authenticate();
    const quickbooks = quickbooksClient.getQuickbooks();
    const params: Record<string, any> = {};
    if (options.start_date) params.start_date = options.start_date;
    if (options.end_date) params.end_date = options.end_date;
    if (options.accounting_method) params.accounting_method = options.accounting_method;
    if (options.account) params.account = options.account;
    if (options.source_account) params.source_account = options.source_account;
    if (options.sort_by) params.sort_by = options.sort_by;

    return new Promise((resolve) => {
      (quickbooks as any).reportGeneralLedgerDetail(params, (err: any, report: any) => {
        if (err) resolve({ result: null, isError: true, error: formatError(err) });
        else resolve({ result: report, isError: false, error: null });
      });
    });
  } catch (error) {
    return { result: null, isError: true, error: formatError(error) };
  }
}
