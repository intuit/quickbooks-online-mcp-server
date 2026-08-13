import { searchQuickbooksPaymentMethods } from "../handlers/search-quickbooks-payment-methods.handler.js";
import { ToolDefinition } from "../types/tool-definition.js";
import { z } from "zod";

const toolName = "search_payment_methods";
const toolDescription = "Search for payment methods in QuickBooks Online with optional filters.";
const toolSchema = z.object({
  name: z.string().optional().describe("Filter by payment method name"),
  active: z.boolean().optional().describe("Filter by active status"),
  type: z.enum(["CREDIT_CARD", "NON_CREDIT_CARD"]).optional().describe("Filter by payment method type"),
  limit: z.number().optional().describe("Maximum results to return"),
});

const toolHandler = async ({ params }: any) => {
  const response = await searchQuickbooksPaymentMethods(params);
  if (response.isError) return { content: [{ type: "text" as const, text: `Error: ${response.error}` }] };
  return { content: [{ type: "text" as const, text: `Found ${response.result.length} payment methods:` }, { type: "text" as const, text: JSON.stringify(response.result, null, 2) }] };
};

export const SearchPaymentMethodsTool: ToolDefinition<typeof toolSchema> = { name: toolName, description: toolDescription, schema: toolSchema, handler: toolHandler };
