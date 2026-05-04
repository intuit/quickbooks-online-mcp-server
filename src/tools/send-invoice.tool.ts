import { sendQuickbooksInvoice } from "../handlers/send-quickbooks-invoice.handler.js";
import { ToolDefinition } from "../types/tool-definition.js";
import { z } from "zod";

const toolName = "send_invoice";
const toolDescription = "Send an invoice PDF via email using QuickBooks Online. Use send_to to specify the recipient email — does not modify the invoice's BillEmail field.";

const toolSchema = z.object({
  invoice_id: z.string().min(1, { message: "Invoice ID is required" }),
  send_to: z.string().email({ message: "A valid recipient email address is required" }),
});

const toolHandler = async ({ params }: any) => {
  const { invoice_id, send_to } = params;
  const response = await sendQuickbooksInvoice({ invoice_id, send_to });

  if (response.isError) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Error sending invoice ${invoice_id}: ${response.error}`,
        },
      ],
    };
  }

  return {
    content: [
      {
        type: "text" as const,
        text: `Invoice ${invoice_id} sent to ${send_to} successfully.`,
      },
    ],
  };
};

export const SendInvoiceTool: ToolDefinition<typeof toolSchema> = {
  name: toolName,
  description: toolDescription,
  schema: toolSchema,
  handler: toolHandler,
};
