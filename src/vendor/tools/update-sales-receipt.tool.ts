import { updateQuickbooksSalesReceipt } from "../handlers/update-quickbooks-sales-receipt.handler.js";
import { ToolDefinition } from "../types/tool-definition.js";
import { z } from "zod";

const toolName = "update_sales_receipt";
const toolDescription = "Update an existing sales receipt in QuickBooks Online.";

const toolSchema = z.object({
  id: z.string().min(1).describe("Sales Receipt ID"),
  sync_token: z.string().min(1).describe("Sync token for optimistic locking"),
  customer_ref: z.string().optional().describe("Customer ID"),
  private_note: z.string().optional().describe("Private note"),
  doc_number: z.string().optional().describe("Document number"),
});

const toolHandler = async ({ params }: any) => {
  const response = await updateQuickbooksSalesReceipt(params);
  if (response.isError) {
    return { content: [{ type: "text" as const, text: `Error updating sales receipt: ${response.error}` }] };
  }
  return {
    content: [
      { type: "text" as const, text: `Sales receipt updated successfully:` },
      { type: "text" as const, text: JSON.stringify(response.result, null, 2) },
    ],
  };
};

export const UpdateSalesReceiptTool: ToolDefinition<typeof toolSchema> = {
  name: toolName,
  description: toolDescription,
  schema: toolSchema,
  handler: toolHandler,
};
