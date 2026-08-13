import { getQuickbooksPaymentMethod } from "../handlers/get-quickbooks-payment-method.handler.js";
import { ToolDefinition } from "../types/tool-definition.js";
import { z } from "zod";

const toolName = "get_payment_method";
const toolDescription = "Retrieve a specific payment method from QuickBooks Online by ID.";
const toolSchema = z.object({
  id: z.string().min(1).describe("Payment method ID"),
});

const toolHandler = async ({ params }: any) => {
  const response = await getQuickbooksPaymentMethod(params.id);
  if (response.isError) return { content: [{ type: "text" as const, text: `Error: ${response.error}` }] };
  return { content: [{ type: "text" as const, text: JSON.stringify(response.result, null, 2) }] };
};

export const GetPaymentMethodTool: ToolDefinition<typeof toolSchema> = { name: toolName, description: toolDescription, schema: toolSchema, handler: toolHandler };
