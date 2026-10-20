import { deleteQuickbooksInvoice } from "../handlers/delete-quickbooks-invoice.handler.js";
import { confirmationToolText } from "../helpers/confirm-flow.js";
import { ToolDefinition } from "../types/tool-definition.js";
import { z } from "zod";

const toolName = "delete_invoice";
const toolDescription =
  "Voids the invoice (keeps the record, sets amounts to zero). Two steps: call once without `confirmation_code` to get a summary and code, show the summary to the user and ask, then call again with the code.";
const toolSchema = z.object({
  id: z.string().min(1),
  confirmation_code: z.string().optional(),
});

const toolHandler = async ({ params }: any) => {
  const response = await deleteQuickbooksInvoice(params);

  if (response.isError) {
    return { content: [{ type: "text" as const, text: `Error voiding invoice: ${response.error}` }] };
  }

  return {
    content: confirmationToolText(response, "Invoice voided:").map((text) => ({ type: "text" as const, text })),
  };
};

export const DeleteInvoiceTool: ToolDefinition<typeof toolSchema> = {
  name: toolName,
  description: toolDescription,
  schema: toolSchema,
  handler: toolHandler,
};
