import { updateQuickbooksClass } from "../handlers/update-quickbooks-class.handler.js";
import { ToolDefinition } from "../types/tool-definition.js";
import { z } from "zod";

const toolName = "update_class";
const toolDescription = "Update an existing class in QuickBooks Online.";
const toolSchema = z.object({
  id: z.string().min(1).describe("Class ID"),
  sync_token: z.string().min(1).describe("Sync token for concurrency"),
  name: z.string().optional().describe("Updated class name"),
  active: z.boolean().optional().describe("Whether class is active"),
});

const toolHandler = async ({ params }: any) => {
  const response = await updateQuickbooksClass(params);
  if (response.isError) return { content: [{ type: "text" as const, text: `Error: ${response.error}` }] };
  return { content: [{ type: "text" as const, text: `Class updated:` }, { type: "text" as const, text: JSON.stringify(response.result, null, 2) }] };
};

export const UpdateClassTool: ToolDefinition<typeof toolSchema> = { name: toolName, description: toolDescription, schema: toolSchema, handler: toolHandler };
