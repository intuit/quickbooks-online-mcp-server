import { updateQuickbooksPaymentMethod } from "../handlers/update-quickbooks-payment-method.handler.js";
import { ToolDefinition } from "../types/tool-definition.js";
import { z } from "zod";

const toolName = "update_payment_method";
const toolDescription = "Update an existing payment method in QuickBooks Online.";
const toolSchema = z.object({
  id: z.string().min(1).describe("Payment method ID"),
  sync_token: z.string().min(1).describe("Sync token for concurrency"),
  name: z.string().optional().describe("Updated payment method name"),
  active: z.boolean().optional().describe("Whether payment method is active"),
});

const toolHandler = async ({ params }: any) => {
  const response = await updateQuickbooksPaymentMethod(params);
  if (response.isError) return { content: [{ type: "text" as const, text: `Error: ${response.error}` }] };
  return { content: [{ type: "text" as const, text: `Payment method updated:` }, { type: "text" as const, text: JSON.stringify(response.result, null, 2) }] };
};

export const UpdatePaymentMethodTool: ToolDefinition<typeof toolSchema> = { name: toolName, description: toolDescription, schema: toolSchema, handler: toolHandler };
