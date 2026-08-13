import { createQuickbooksPurchaseOrder } from "../handlers/create-quickbooks-purchase-order.handler.js";
import { ToolDefinition } from "../types/tool-definition.js";
import { z } from "zod";

const toolName = "create_purchase_order";
const toolDescription = "Create a purchase order in QuickBooks Online.";

const lineItemSchema = z.object({
  item_ref: z.string().min(1),
  qty: z.number().positive(),
  unit_price: z.number().nonnegative(),
  description: z.string().optional(),
});

const toolSchema = z.object({
  vendor_ref: z.string().min(1).describe("Vendor ID"),
  line_items: z.array(lineItemSchema).min(1).describe("Line items"),
  txn_date: z.string().optional().describe("Transaction date (YYYY-MM-DD)"),
  doc_number: z.string().optional().describe("Document number"),
  private_note: z.string().optional().describe("Private note"),
});

const toolHandler = async ({ params }: any) => {
  const response = await createQuickbooksPurchaseOrder(params);
  if (response.isError) {
    return { content: [{ type: "text" as const, text: `Error creating purchase order: ${response.error}` }] };
  }
  return {
    content: [
      { type: "text" as const, text: `Purchase order created successfully:` },
      { type: "text" as const, text: JSON.stringify(response.result, null, 2) },
    ],
  };
};

export const CreatePurchaseOrderTool: ToolDefinition<typeof toolSchema> = {
  name: toolName,
  description: toolDescription,
  schema: toolSchema,
  handler: toolHandler,
};
