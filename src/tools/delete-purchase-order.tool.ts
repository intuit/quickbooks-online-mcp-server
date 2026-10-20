import { deleteQuickbooksPurchaseOrder } from "../handlers/delete-quickbooks-purchase-order.handler.js";
import { confirmationToolText } from "../helpers/confirm-flow.js";
import { ToolDefinition } from "../types/tool-definition.js";
import { z } from "zod";

const toolName = "delete_purchase_order";
const toolDescription =
  "Permanently deletes the purchase order (cannot be undone). Two steps: call once without `confirmation_code` to get a summary and code, show the summary to the user and ask, then call again with the code.";
const toolSchema = z.object({
  id: z.string().min(1),
  confirmation_code: z.string().optional(),
});

const toolHandler = async ({ params }: any) => {
  const response = await deleteQuickbooksPurchaseOrder(params);

  if (response.isError) {
    return { content: [{ type: "text" as const, text: `Error deleting purchase order: ${response.error}` }] };
  }

  return {
    content: confirmationToolText(response, "Purchase order permanently deleted:").map((text) => ({ type: "text" as const, text })),
  };
};

export const DeletePurchaseOrderTool: ToolDefinition<typeof toolSchema> = {
  name: toolName,
  description: toolDescription,
  schema: toolSchema,
  handler: toolHandler,
};
