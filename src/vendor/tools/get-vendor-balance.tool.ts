import { getQuickbooksVendorBalance } from "../handlers/get-quickbooks-vendor-balance.handler.js";
import { ToolDefinition } from "../types/tool-definition.js";
import { z } from "zod";

const toolName = "get_vendor_balance";
const toolDescription = "Generate a Vendor Balance report from QuickBooks Online showing outstanding balances by vendor.";
const toolSchema = z.object({
  report_date: z.string().optional().describe("Report date (YYYY-MM-DD)"),
  vendor: z.string().optional().describe("Filter by vendor ID"),
  summarize_column_by: z.enum(["Total", "Month", "Week", "Days"]).optional().describe("How to summarize columns"),
});

const toolHandler = async ({ params }: any) => {
  const response = await getQuickbooksVendorBalance(params);
  if (response.isError) return { content: [{ type: "text" as const, text: `Error: ${response.error}` }] };
  return { content: [{ type: "text" as const, text: `Vendor Balance Report:` }, { type: "text" as const, text: JSON.stringify(response.result, null, 2) }] };
};

export const GetVendorBalanceTool: ToolDefinition<typeof toolSchema> = { name: toolName, description: toolDescription, schema: toolSchema, handler: toolHandler };
