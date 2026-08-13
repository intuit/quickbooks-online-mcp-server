import { getQuickbooksCustomerSales } from "../handlers/get-quickbooks-customer-sales.handler.js";
import { ToolDefinition } from "../types/tool-definition.js";
import { z } from "zod";

const toolName = "get_customer_sales";
const toolDescription = "Generate a Customer Sales report from QuickBooks Online showing sales by customer.";
const toolSchema = z.object({
  start_date: z.string().optional().describe("Start date (YYYY-MM-DD)"),
  end_date: z.string().optional().describe("End date (YYYY-MM-DD)"),
  customer: z.string().optional().describe("Filter by customer ID"),
  summarize_column_by: z.enum(["Total", "Month", "Week", "Days"]).optional().describe("How to summarize columns"),
});

const toolHandler = async ({ params }: any) => {
  const response = await getQuickbooksCustomerSales(params);
  if (response.isError) return { content: [{ type: "text" as const, text: `Error: ${response.error}` }] };
  return { content: [{ type: "text" as const, text: `Customer Sales Report:` }, { type: "text" as const, text: JSON.stringify(response.result, null, 2) }] };
};

export const GetCustomerSalesTool: ToolDefinition<typeof toolSchema> = { name: toolName, description: toolDescription, schema: toolSchema, handler: toolHandler };
