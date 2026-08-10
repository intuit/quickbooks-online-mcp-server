import { QuickbooksClient } from "../clients/quickbooks-client.js";
import { ToolResponse } from "../types/tool-response.js";
import { formatError } from "../helpers/format-error.js";

export interface GeneralLedgerOptions {
  start_date?: string;
  end_date?: string;
  accounting_method?: "Cash" | "Accrual";
  account?: string;
  source_account?: string;
  sort_by?: string;
  /** Return compact flattened rows instead of QBO's raw nested report (defect #12). */
  summary?: boolean;
  /** With summary, keep only these columns (by column title). */
  fields?: string[];
}

/**
 * Flatten QBO's nested report structure (Rows.Row[] with ColData, sections,
 * and sub-rows) into an array of {columnTitle: value} objects — a fraction of
 * the raw report's size and directly usable by the caller.
 */
export function flattenReportRows(report: any, fields?: string[]): { columns: string[]; rows: any[] } {
  const columns: string[] = (report?.Columns?.Column ?? []).map(
    (c: any, i: number) => c?.ColTitle || c?.ColType || `col${i}`
  );
  const rows: any[] = [];
  const walk = (rowContainer: any, section: string | undefined) => {
    for (const row of rowContainer?.Row ?? []) {
      const header = row?.Header?.ColData?.[0]?.value;
      if (Array.isArray(row?.ColData)) {
        const obj: Record<string, any> = {};
        row.ColData.forEach((cd: any, i: number) => {
          const key = columns[i] ?? `col${i}`;
          if (!fields || fields.length === 0 || fields.includes(key)) obj[key] = cd?.value ?? "";
        });
        if (section) obj._section = section;
        rows.push(obj);
      }
      if (row?.Rows) walk(row.Rows, header ?? section);
    }
  };
  walk(report?.Rows, undefined);
  return { columns, rows };
}

export async function getQuickbooksGeneralLedger(options: GeneralLedgerOptions): Promise<ToolResponse<any>> {
  try {
    const quickbooks = await QuickbooksClient.getInstance();
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
        else if (options.summary || (options.fields && options.fields.length > 0)) {
          resolve({ result: flattenReportRows(report, options.fields), isError: false, error: null });
        } else resolve({ result: report, isError: false, error: null });
      });
    });
  } catch (error) {
    return { result: null, isError: true, error: formatError(error) };
  }
}
