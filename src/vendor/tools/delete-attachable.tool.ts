import { deleteQuickbooksAttachable } from "../handlers/delete-quickbooks-attachable.handler.js";
import { ToolDefinition } from "../types/tool-definition.js";
import { z } from "zod";

const toolName = "delete_attachable";
const toolDescription = "Delete an attachable from QuickBooks Online.";
const toolSchema = z.object({
  id: z.string().min(1).describe("Attachable ID"),
  sync_token: z.string().min(1).describe("Sync token for concurrency"),
});

const toolHandler = async ({ params }: any) => {
  const response = await deleteQuickbooksAttachable(params);
  if (response.isError) return { content: [{ type: "text" as const, text: `Error: ${response.error}` }] };
  return { content: [{ type: "text" as const, text: `Attachable deleted successfully` }] };
};

export const DeleteAttachableTool: ToolDefinition<typeof toolSchema> = { name: toolName, description: toolDescription, schema: toolSchema, handler: toolHandler };
