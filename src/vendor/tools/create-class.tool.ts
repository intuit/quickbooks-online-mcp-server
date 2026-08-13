import { createQuickbooksClass } from "../handlers/create-quickbooks-class.handler.js";
import { ToolDefinition } from "../types/tool-definition.js";
import { z } from "zod";

const toolName = "create_class";
const toolDescription = "Create a new class in QuickBooks Online for categorizing transactions.";
const toolSchema = z.object({
  name: z.string().min(1).describe("Class name"),
  parent_ref: z.string().optional().describe("Parent class ID for sub-classes"),
});

const toolHandler = async ({ params }: any) => {
  const response = await createQuickbooksClass(params);
  if (response.isError) return { content: [{ type: "text" as const, text: `Error: ${response.error}` }] };
  return { content: [{ type: "text" as const, text: `Class created:` }, { type: "text" as const, text: JSON.stringify(response.result, null, 2) }] };
};

export const CreateClassTool: ToolDefinition<typeof toolSchema> = { name: toolName, description: toolDescription, schema: toolSchema, handler: toolHandler };
