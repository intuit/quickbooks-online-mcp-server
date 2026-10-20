import { deleteQuickbooksBillPayment } from "../handlers/delete-quickbooks-bill-payment.handler.js";
import { confirmationToolText } from "../helpers/confirm-flow.js";
import { ToolDefinition } from "../types/tool-definition.js";
import { z } from "zod";

const toolName = "delete_bill_payment";
const toolDescription =
  "Voids the bill payment (keeps the record, sets amounts to zero). Two steps: call once without `confirmation_code` to get a summary and code, show the summary to the user and ask, then call again with the code.";
const toolSchema = z.object({
  id: z.string().min(1),
  confirmation_code: z.string().optional(),
});

const toolHandler = async ({ params }: any) => {
  const response = await deleteQuickbooksBillPayment(params);

  if (response.isError) {
    return { content: [{ type: "text" as const, text: `Error voiding bill payment: ${response.error}` }] };
  }

  return {
    content: confirmationToolText(response, "BillPayment voided:").map((text) => ({ type: "text" as const, text })),
  };
};

export const DeleteBillPaymentTool: ToolDefinition<typeof toolSchema> = {
  name: toolName,
  description: toolDescription,
  schema: toolSchema,
  handler: toolHandler,
};
