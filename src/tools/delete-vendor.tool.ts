import { deleteQuickbooksVendor } from "../handlers/delete-quickbooks-vendor.handler.js";
import { ToolDefinition } from "../types/tool-definition.js";
import { z } from "zod";

const toolName = "delete-vendor";
const toolDescription = "Marks the vendor inactive (can be undone in QuickBooks).";
const toolSchema = z.object({ id: z.string().min(1) });

const toolHandler = async ({ params }: any) => {
  const response = await deleteQuickbooksVendor(params.id);

  if (response.isError) {
    return { content: [{ type: "text" as const, text: `Error marking vendor inactive: ${response.error}` }] };
  }

  return {
    content: [
      { type: "text" as const, text: `Vendor marked inactive:` },
      { type: "text" as const, text: JSON.stringify(response.result) },
    ],
  };
};

export const DeleteVendorTool: ToolDefinition<typeof toolSchema> = {
  name: toolName,
  description: toolDescription,
  schema: toolSchema,
  handler: toolHandler,
};
