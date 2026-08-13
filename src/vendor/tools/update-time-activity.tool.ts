import { updateQuickbooksTimeActivity } from "../handlers/update-quickbooks-time-activity.handler.js";
import { ToolDefinition } from "../types/tool-definition.js";
import { z } from "zod";

const toolName = "update_time_activity";
const toolDescription = "Update a time activity in QuickBooks Online.";
const toolSchema = z.object({
  id: z.string().min(1).describe("Time Activity ID"),
  sync_token: z.string().min(1).describe("Sync token"),
  hours: z.number().optional().describe("Hours worked"),
  minutes: z.number().optional().describe("Minutes worked"),
  description: z.string().optional().describe("Description"),
  billable_status: z.enum(["Billable", "NotBillable", "HasBeenBilled"]).optional().describe("Billable status"),
  item_ref: z.string().optional().describe("Service Item ID (ItemRef) — the QBO Item to associate with this time entry"),
});

const toolHandler = async ({ params }: any) => {
  const response = await updateQuickbooksTimeActivity(params);
  if (response.isError) return { content: [{ type: "text" as const, text: `Error: ${response.error}` }] };
  return { content: [{ type: "text" as const, text: `Time activity updated:` }, { type: "text" as const, text: JSON.stringify(response.result, null, 2) }] };
};

export const UpdateTimeActivityTool: ToolDefinition<typeof toolSchema> = { name: toolName, description: toolDescription, schema: toolSchema, handler: toolHandler };
