import { getQuickbooksReport } from "../handlers/get-quickbooks-report.handler.js";
import { ToolDefinition } from "../types/tool-definition.js";
import { z } from "zod";

const toolName = "get_report";
const toolDescription =
  "Fetch a QuickBooks Online report (ProfitAndLoss, BalanceSheet, GeneralLedger, TrialBalance).";

const toolSchema = z.object({
  reportName: z.string().describe("Report type: ProfitAndLoss, BalanceSheet, GeneralLedger, TrialBalance"),
  start_date: z.string().optional().describe("Start date YYYY-MM-DD"),
  end_date: z.string().optional().describe("End date YYYY-MM-DD"),
  accounting_method: z.string().optional().describe("Accrual or Cash"),
});

const toolHandler = async (args: any) => {
  const { reportName, start_date, end_date, accounting_method } = args.params;

  const params: Record<string, string> = {};
  if (start_date) params.start_date = start_date;
  if (end_date) params.end_date = end_date;
  if (accounting_method) params.accounting_method = accounting_method;

  const response = await getQuickbooksReport(reportName, params);

  if (response.isError) {
    return {
      content: [
        { type: "text" as const, text: `Error fetching report: ${response.error}` },
      ],
    };
  }

  return {
    content: [
      { type: "text" as const, text: JSON.stringify(response.result) },
    ],
  };
};

export const GetReportTool: ToolDefinition<typeof toolSchema> = {
  name: toolName,
  description: toolDescription,
  schema: toolSchema,
  handler: toolHandler,
};
