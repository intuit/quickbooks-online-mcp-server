import { getQuickbooksAgedPayables } from "../handlers/get-quickbooks-aged-payables.handler.js";
import { ToolDefinition } from "../types/tool-definition.js";
import { z } from "zod";

const toolName = "get_aged_payables";
const toolDescription = "Generate an Aged Payables (A/P Aging) report from QuickBooks Online showing outstanding vendor bills.";
const toolSchema = z.object({
  report_date: z.string().optional().describe("Report date (YYYY-MM-DD)"),
  vendor: z.string().optional().describe("Filter by vendor ID"),
  aging_method: z.enum(["Current", "Report_Date"]).optional().describe("Aging method"),
  days_per_aging_period: z.number().optional().describe("Days per aging period (default 30)"),
  num_periods: z.number().optional().describe("Number of aging periods (default 4)"),
});

const toolHandler = async ({ params }: any) => {
  const response = await getQuickbooksAgedPayables(params);
  if (response.isError) return { content: [{ type: "text" as const, text: `Error: ${response.error}` }] };
  return { content: [{ type: "text" as const, text: `Aged Payables Report:` }, { type: "text" as const, text: JSON.stringify(response.result, null, 2) }] };
};

export const GetAgedPayablesTool: ToolDefinition<typeof toolSchema> = { name: toolName, description: toolDescription, schema: toolSchema, handler: toolHandler };
