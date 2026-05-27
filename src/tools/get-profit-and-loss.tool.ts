import { getQuickbooksProfitAndLoss } from "../handlers/get-quickbooks-profit-and-loss.handler.js";
import { ToolDefinition } from "../types/tool-definition.js";
import { z } from "zod";

const toolName = "get_profit_and_loss";
const toolDescription = "Generate a Profit and Loss (Income Statement) report from QuickBooks Online.";
const toolSchema = z.object({
  start_date: z.string().optional().describe("Start date (YYYY-MM-DD)"),
  end_date: z.string().optional().describe("End date (YYYY-MM-DD)"),
  accounting_method: z.enum(["Cash", "Accrual"]).optional().describe("Accounting method"),
  summarize_column_by: z.enum(["Total", "Month", "Week", "Days", "Classes"]).optional().describe("How to summarize columns"),
  customer: z.string().optional().describe("Filter by customer ID"),
  vendor: z.string().optional().describe("Filter by vendor ID"),
  item: z.string().optional().describe("Filter by item ID"),
  department: z.string().optional().describe("Filter by department ID"),
  class: z.string().optional().describe("Filter by class ID"),
});

const toolHandler = async ({ params }: any) => {
  const response = await getQuickbooksProfitAndLoss(params);
  if (response.isError) return { content: [{ type: "text" as const, text: `Error: ${response.error}` }] };
  return { content: [{ type: "text" as const, text: `Profit and Loss Report:` }, { type: "text" as const, text: JSON.stringify(response.result, null, 2) }] };
};

export const GetProfitAndLossTool: ToolDefinition<typeof toolSchema> = { name: toolName, description: toolDescription, schema: toolSchema, handler: toolHandler };
