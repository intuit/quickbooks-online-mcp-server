import { getQuickbooksAttachable } from "../handlers/get-quickbooks-attachable.handler.js";
import { ToolDefinition } from "../types/tool-definition.js";
import { z } from "zod";

const toolName = "get_attachable";
const toolDescription = "Retrieve a specific attachable from QuickBooks Online by ID.";
const toolSchema = z.object({
  id: z.string().min(1).describe("Attachable ID"),
});

const toolHandler = async ({ params }: any) => {
  const response = await getQuickbooksAttachable(params.id);
  if (response.isError) return { content: [{ type: "text" as const, text: `Error: ${response.error}` }] };
  return { content: [{ type: "text" as const, text: JSON.stringify(response.result, null, 2) }] };
};

export const GetAttachableTool: ToolDefinition<typeof toolSchema> = { name: toolName, description: toolDescription, schema: toolSchema, handler: toolHandler };
