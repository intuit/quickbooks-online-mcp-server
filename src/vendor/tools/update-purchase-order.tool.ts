import { updateQuickbooksPurchaseOrder } from "../handlers/update-quickbooks-purchase-order.handler.js";
import { ToolDefinition } from "../types/tool-definition.js";
import { z } from "zod";

const toolName = "update_purchase_order";
const toolDescription = "Update an existing purchase order in QuickBooks Online.";

const toolSchema = z.object({
  id: z.string().min(1).describe("Purchase Order ID"),
  sync_token: z.string().min(1).describe("Sync token"),
  vendor_ref: z.string().optional().describe("Vendor ID"),
  private_note: z.string().optional().describe("Private note"),
  doc_number: z.string().optional().describe("Document number"),
});

const toolHandler = async ({ params }: any) => {
  const response = await updateQuickbooksPurchaseOrder(params);
  if (response.isError) {
    return { content: [{ type: "text" as const, text: `Error updating purchase order: ${response.error}` }] };
  }
  return {
    content: [
      { type: "text" as const, text: `Purchase order updated successfully:` },
      { type: "text" as const, text: JSON.stringify(response.result, null, 2) },
    ],
  };
};

export const UpdatePurchaseOrderTool: ToolDefinition<typeof toolSchema> = {
  name: toolName,
  description: toolDescription,
  schema: toolSchema,
  handler: toolHandler,
};
