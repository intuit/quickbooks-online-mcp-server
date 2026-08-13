import { getQuickbooksAgedReceivables } from "../handlers/get-quickbooks-aged-receivables.handler.js";
import { ToolDefinition } from "../types/tool-definition.js";
import { z } from "zod";

const toolName = "get_aged_receivables";
const toolDescription = "Generate an Aged Receivables (A/R Aging) report from QuickBooks Online showing outstanding customer invoices.";
const toolSchema = z.object({
  report_date: z.string().optional().describe("Report date (YYYY-MM-DD)"),
  customer: z.string().optional().describe("Filter by customer ID"),
  aging_method: z.enum(["Current", "Report_Date"]).optional().describe("Aging method"),
  days_per_aging_period: z.number().optional().describe("Days per aging period (default 30)"),
  num_periods: z.number().optional().describe("Number of aging periods (default 4)"),
});

const toolHandler = async ({ params }: any) => {
  const response = await getQuickbooksAgedReceivables(params);
  if (response.isError) return { content: [{ type: "text" as const, text: `Error: ${response.error}` }] };
  return { content: [{ type: "text" as const, text: `Aged Receivables Report:` }, { type: "text" as const, text: JSON.stringify(response.result, null, 2) }] };
};

export const GetAgedReceivablesTool: ToolDefinition<typeof toolSchema> = { name: toolName, description: toolDescription, schema: toolSchema, handler: toolHandler };
