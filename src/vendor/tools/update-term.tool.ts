import { updateQuickbooksTerm } from "../handlers/update-quickbooks-term.handler.js";
import { ToolDefinition } from "../types/tool-definition.js";
import { z } from "zod";

const toolName = "update_term";
const toolDescription = "Update an existing payment term in QuickBooks Online.";
const toolSchema = z.object({
  id: z.string().min(1).describe("Term ID"),
  sync_token: z.string().min(1).describe("Sync token for concurrency"),
  name: z.string().optional().describe("Updated term name"),
  active: z.boolean().optional().describe("Whether term is active"),
  due_days: z.number().optional().describe("Number of days until payment is due"),
  discount_days: z.number().optional().describe("Days to qualify for early payment discount"),
  discount_percent: z.number().optional().describe("Early payment discount percentage"),
});

const toolHandler = async ({ params }: any) => {
  const response = await updateQuickbooksTerm(params);
  if (response.isError) return { content: [{ type: "text" as const, text: `Error: ${response.error}` }] };
  return { content: [{ type: "text" as const, text: `Term updated:` }, { type: "text" as const, text: JSON.stringify(response.result, null, 2) }] };
};

export const UpdateTermTool: ToolDefinition<typeof toolSchema> = { name: toolName, description: toolDescription, schema: toolSchema, handler: toolHandler };
