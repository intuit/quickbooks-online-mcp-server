import { getQuickbooksBalanceSheet } from "../handlers/get-quickbooks-balance-sheet.handler.js";
import { ToolDefinition } from "../types/tool-definition.js";
import { z } from "zod";

const toolName = "get_balance_sheet";
const toolDescription = "Generate a Balance Sheet report from QuickBooks Online showing assets, liabilities, and equity.";
const toolSchema = z.object({
  start_date: z.string().optional().describe("Start date (YYYY-MM-DD)"),
  end_date: z.string().optional().describe("End date (YYYY-MM-DD)"),
  accounting_method: z.enum(["Cash", "Accrual"]).optional().describe("Accounting method"),
  summarize_column_by: z.enum(["Total", "Month", "Week", "Days"]).optional().describe("How to summarize columns"),
});

const toolHandler = async ({ params }: any) => {
  const response = await getQuickbooksBalanceSheet(params);
  if (response.isError) return { content: [{ type: "text" as const, text: `Error: ${response.error}` }] };
  return { content: [{ type: "text" as const, text: `Balance Sheet Report:` }, { type: "text" as const, text: JSON.stringify(response.result, null, 2) }] };
};

export const GetBalanceSheetTool: ToolDefinition<typeof toolSchema> = { name: toolName, description: toolDescription, schema: toolSchema, handler: toolHandler };
