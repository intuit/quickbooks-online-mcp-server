import { deleteQuickbooksTimeActivity } from "../handlers/delete-quickbooks-time-activity.handler.js";
import { ToolDefinition } from "../types/tool-definition.js";
import { z } from "zod";

const toolName = "delete_time_activity";
const toolDescription = "Delete a time activity in QuickBooks Online.";
const toolSchema = z.object({ idOrEntity: z.any() });

const toolHandler = async (args: any) => {
  const response = await deleteQuickbooksTimeActivity(args.params.idOrEntity);
  if (response.isError) return { content: [{ type: "text" as const, text: `Error: ${response.error}` }] };
  return { content: [{ type: "text" as const, text: `Time activity deleted:` }, { type: "text" as const, text: JSON.stringify(response.result) }] };
};

export const DeleteTimeActivityTool: ToolDefinition<typeof toolSchema> = { name: toolName, description: toolDescription, schema: toolSchema, handler: toolHandler };
