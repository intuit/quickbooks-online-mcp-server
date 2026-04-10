import { getQuickbooksVendor } from "../handlers/get-quickbooks-vendor.handler.js";
import { ToolDefinition } from "../types/tool-definition.js";
import { z } from "zod";

const toolName = "get-vendor";
const toolDescription = "Get a vendor by ID from QuickBooks Online.";
const toolSchema = z.object({
  id: z.string(),
});

const toolHandler = async (args: { [x: string]: any }) => {
  const response = await getQuickbooksVendor(args.params.id);

  if (response.isError) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Error getting vendor: ${response.error}`,
        },
      ],
    };
  }

  const vendor = response.result;

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(vendor),
      }
    ],
  };
};

export const GetVendorTool: ToolDefinition<typeof toolSchema> = {
  name: toolName,
  description: toolDescription,
  schema: toolSchema,
  handler: toolHandler,
}; 