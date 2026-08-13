import { getQuickbooksSalesReceipt } from "../handlers/get-quickbooks-sales-receipt.handler.js";
import { ToolDefinition } from "../types/tool-definition.js";
import { z } from "zod";

const toolName = "get_sales_receipt";
const toolDescription = "Get a single sales receipt by ID from QuickBooks Online.";
const toolSchema = z.object({
  id: z.string().min(1).describe("The QuickBooks Sales Receipt ID"),
});

const toolHandler = async ({ params }: any) => {
  const response = await getQuickbooksSalesReceipt(params.id);
  if (response.isError) {
    return { content: [{ type: "text" as const, text: `Error getting sales receipt: ${response.error}` }] };
  }
  return {
    content: [
      { type: "text" as const, text: `Sales receipt found:` },
      { type: "text" as const, text: JSON.stringify(response.result, null, 2) },
    ],
  };
};

export const GetSalesReceiptTool: ToolDefinition<typeof toolSchema> = {
  name: toolName,
  description: toolDescription,
  schema: toolSchema,
  handler: toolHandler,
};
