import { updateQuickbooksItem } from "../handlers/update-quickbooks-item.handler.js";
import { ToolDefinition } from "../types/tool-definition.js";
import { z } from "zod";

const toolName = "update_item";
const toolDescription =
  "Updates an existing item in QuickBooks Online by ID. Changes only the fields you send in `patch`; other fields are kept. Nested objects (e.g. BillAddr, ShipAddr, PrimaryEmailAddr) replace the whole object — send all of its sub-fields.";

const toolSchema = z.object({
  item_id: z.string().min(1),
  patch: z.record(z.any()),
});

const toolHandler = async ({ params }: any) => {
  const response = await updateQuickbooksItem(params);
  if (response.isError) {
    return { content: [{ type: "text" as const, text: `Error updating item: ${response.error}` }] };
  }
  return {
    content: [
      { type: "text" as const, text: `Item updated successfully:` },
      { type: "text" as const, text: JSON.stringify(response.result, null, 2) },
    ],
  };
};

export const UpdateItemTool: ToolDefinition<typeof toolSchema> = {
  name: toolName,
  description: toolDescription,
  schema: toolSchema,
  handler: toolHandler,
}; 