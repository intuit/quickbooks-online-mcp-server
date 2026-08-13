import { getQuickbooksCashFlow } from "../handlers/get-quickbooks-cash-flow.handler.js";
import { ToolDefinition } from "../types/tool-definition.js";
import { z } from "zod";

const toolName = "get_cash_flow";
const toolDescription = "Generate a Statement of Cash Flows report from QuickBooks Online.";
const toolSchema = z.object({
  start_date: z.string().optional().describe("Start date (YYYY-MM-DD)"),
  end_date: z.string().optional().describe("End date (YYYY-MM-DD)"),
  summarize_column_by: z.enum(["Total", "Month", "Week", "Days"]).optional().describe("How to summarize columns"),
});

const toolHandler = async ({ params }: any) => {
  const response = await getQuickbooksCashFlow(params);
  if (response.isError) return { content: [{ type: "text" as const, text: `Error: ${response.error}` }] };
  return { content: [{ type: "text" as const, text: `Cash Flow Statement:` }, { type: "text" as const, text: JSON.stringify(response.result, null, 2) }] };
};

export const GetCashFlowTool: ToolDefinition<typeof toolSchema> = { name: toolName, description: toolDescription, schema: toolSchema, handler: toolHandler };
