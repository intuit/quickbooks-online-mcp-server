import { updateQuickbooksPayment } from "../handlers/update-quickbooks-payment.handler.js";
import { ToolDefinition } from "../types/tool-definition.js";
import { z } from "zod";

const toolName = "update_payment";
const toolDescription = "Update an existing payment in QuickBooks Online.";

const toolSchema = z.object({
  id: z.string().min(1).describe("Payment ID"),
  sync_token: z.string().min(1).describe("Sync token for optimistic locking"),
  customer_ref: z.string().optional().describe("Customer ID"),
  total_amt: z.number().optional().describe("Total payment amount"),
  payment_method_ref: z.string().optional().describe("Payment method ID"),
  private_note: z.string().optional().describe("Private note"),
});

const toolHandler = async ({ params }: any) => {
  const response = await updateQuickbooksPayment(params);
  if (response.isError) {
    return { content: [{ type: "text" as const, text: `Error updating payment: ${response.error}` }] };
  }
  return {
    content: [
      { type: "text" as const, text: `Payment updated successfully:` },
      { type: "text" as const, text: JSON.stringify(response.result, null, 2) },
    ],
  };
};

export const UpdatePaymentTool: ToolDefinition<typeof toolSchema> = {
  name: toolName,
  description: toolDescription,
  schema: toolSchema,
  handler: toolHandler,
};
