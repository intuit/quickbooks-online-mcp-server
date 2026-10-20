import { deleteQuickbooksVendorCredit } from "../handlers/delete-quickbooks-vendor-credit.handler.js";
import { confirmationToolText } from "../helpers/confirm-flow.js";
import { ToolDefinition } from "../types/tool-definition.js";
import { z } from "zod";

const toolName = "delete_vendor_credit";
const toolDescription =
  "Permanently deletes the vendor credit (cannot be undone). Two steps: call once without `confirmation_code` to get a summary and code, show the summary to the user and ask, then call again with the code.";
const toolSchema = z.object({
  id: z.string().min(1),
  confirmation_code: z.string().optional(),
});

const toolHandler = async ({ params }: any) => {
  const response = await deleteQuickbooksVendorCredit(params);

  if (response.isError) {
    return { content: [{ type: "text" as const, text: `Error deleting vendor credit: ${response.error}` }] };
  }

  return {
    content: confirmationToolText(response, "Vendor credit permanently deleted:").map((text) => ({ type: "text" as const, text })),
  };
};

export const DeleteVendorCreditTool: ToolDefinition<typeof toolSchema> = {
  name: toolName,
  description: toolDescription,
  schema: toolSchema,
  handler: toolHandler,
};
