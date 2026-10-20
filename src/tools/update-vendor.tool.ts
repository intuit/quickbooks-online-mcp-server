import { updateQuickbooksVendor } from "../handlers/update-quickbooks-vendor.handler.js";
import { ToolDefinition } from "../types/tool-definition.js";
import { z } from "zod";

const toolName = "update-vendor";
const toolDescription =
  "Updates a vendor in QuickBooks Online. Changes only the fields you send in `patch`; other fields are kept.";

const toolSchema = z.object({
  vendor_id: z.string().min(1),
  patch: z.record(z.any()),
});

const toolHandler = async ({ params }: any) => {
  const response = await updateQuickbooksVendor(params);

  if (response.isError) {
    return {
      content: [
        { type: "text" as const, text: `Error updating vendor: ${response.error}` },
      ],
    };
  }

  return {
    content: [
      { type: "text" as const, text: JSON.stringify(response.result) },
    ],
  };
};

export const UpdateVendorTool: ToolDefinition<typeof toolSchema> = {
  name: toolName,
  description: toolDescription,
  schema: toolSchema,
  handler: toolHandler,
};
