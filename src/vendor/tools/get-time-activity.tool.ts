import { getQuickbooksTimeActivity } from "../handlers/get-quickbooks-time-activity.handler.js";
import { ToolDefinition } from "../types/tool-definition.js";
import { z } from "zod";

const toolName = "get_time_activity";
const toolDescription = "Get a time activity by ID from QuickBooks Online.";
const toolSchema = z.object({ id: z.string().min(1).describe("Time Activity ID") });

const toolHandler = async ({ params }: any) => {
  const response = await getQuickbooksTimeActivity(params.id);
  if (response.isError) return { content: [{ type: "text" as const, text: `Error: ${response.error}` }] };
  return { content: [{ type: "text" as const, text: `Time activity found:` }, { type: "text" as const, text: JSON.stringify(response.result, null, 2) }] };
};

export const GetTimeActivityTool: ToolDefinition<typeof toolSchema> = { name: toolName, description: toolDescription, schema: toolSchema, handler: toolHandler };
