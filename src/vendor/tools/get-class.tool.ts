import { getQuickbooksClass } from "../handlers/get-quickbooks-class.handler.js";
import { ToolDefinition } from "../types/tool-definition.js";
import { z } from "zod";

const toolName = "get_class";
const toolDescription = "Retrieve a specific class from QuickBooks Online by ID.";
const toolSchema = z.object({
  id: z.string().min(1).describe("Class ID"),
});

const toolHandler = async ({ params }: any) => {
  const response = await getQuickbooksClass(params.id);
  if (response.isError) return { content: [{ type: "text" as const, text: `Error: ${response.error}` }] };
  return { content: [{ type: "text" as const, text: JSON.stringify(response.result, null, 2) }] };
};

export const GetClassTool: ToolDefinition<typeof toolSchema> = { name: toolName, description: toolDescription, schema: toolSchema, handler: toolHandler };
