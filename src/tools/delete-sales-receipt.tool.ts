import { deleteQuickbooksSalesReceipt } from "../handlers/delete-quickbooks-sales-receipt.handler.js";
import { confirmationToolText } from "../helpers/confirm-flow.js";
import { ToolDefinition } from "../types/tool-definition.js";
import { z } from "zod";

const toolName = "delete_sales_receipt";
const toolDescription =
  "Voids the sales receipt (keeps the record, sets amounts to zero). Two steps: call once without `confirmation_code` to get a summary and code, show the summary to the user and ask, then call again with the code.";
const toolSchema = z.object({
  id: z.string().min(1),
  confirmation_code: z.string().optional(),
});

const toolHandler = async ({ params }: any) => {
  const response = await deleteQuickbooksSalesReceipt(params);

  if (response.isError) {
    return { content: [{ type: "text" as const, text: `Error voiding sales receipt: ${response.error}` }] };
  }

  return {
    content: confirmationToolText(response, "SalesReceipt voided:").map((text) => ({ type: "text" as const, text })),
  };
};

export const DeleteSalesReceiptTool: ToolDefinition<typeof toolSchema> = {
  name: toolName,
  description: toolDescription,
  schema: toolSchema,
  handler: toolHandler,
};
