import { createQuickbooksTerm } from "../handlers/create-quickbooks-term.handler.js";
import { ToolDefinition } from "../types/tool-definition.js";
import { z } from "zod";

const toolName = "create_term";
const toolDescription = "Create a new payment term in QuickBooks Online (e.g., Net 30, Due on Receipt).";
const toolSchema = z.object({
  name: z.string().min(1).describe("Term name (e.g., 'Net 30')"),
  due_days: z.number().optional().describe("Number of days until payment is due"),
  discount_days: z.number().optional().describe("Days to qualify for early payment discount"),
  discount_percent: z.number().optional().describe("Early payment discount percentage"),
  type: z.enum(["STANDARD", "DATE_DRIVEN"]).optional().describe("Term type"),
  day_of_month_due: z.number().optional().describe("Day of month payment is due (for DATE_DRIVEN)"),
  due_next_month_days: z.number().optional().describe("Days before using next month due date"),
  discount_day_of_month: z.number().optional().describe("Day of month for discount cutoff"),
});

const toolHandler = async ({ params }: any) => {
  const response = await createQuickbooksTerm(params);
  if (response.isError) return { content: [{ type: "text" as const, text: `Error: ${response.error}` }] };
  return { content: [{ type: "text" as const, text: `Term created:` }, { type: "text" as const, text: JSON.stringify(response.result, null, 2) }] };
};

export const CreateTermTool: ToolDefinition<typeof toolSchema> = { name: toolName, description: toolDescription, schema: toolSchema, handler: toolHandler };
