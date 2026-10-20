import { deleteQuickbooksItem } from "../handlers/delete-quickbooks-item.handler.js";
import { ToolDefinition } from "../types/tool-definition.js";
import { z } from "zod";

const toolName = "delete_item";
const toolDescription = "Marks the item inactive (can be undone in QuickBooks).";
const toolSchema = z.object({ id: z.string().min(1) });

const toolHandler = async ({ params }: any) => {
  const response = await deleteQuickbooksItem(params.id);

  if (response.isError) {
    return { content: [{ type: "text" as const, text: `Error marking item inactive: ${response.error}` }] };
  }

  return {
    content: [
      { type: "text" as const, text: `Item marked inactive:` },
      { type: "text" as const, text: JSON.stringify(response.result) },
    ],
  };
};

export const DeleteItemTool: ToolDefinition<typeof toolSchema> = {
  name: toolName,
  description: toolDescription,
  schema: toolSchema,
  handler: toolHandler,
};
