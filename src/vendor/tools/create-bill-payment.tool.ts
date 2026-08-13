import { createQuickbooksBillPayment } from "../handlers/create-quickbooks-bill-payment.handler.js";
import { ToolDefinition } from "../types/tool-definition.js";
import { z } from "zod";

// Define the tool metadata
const toolName = "create_bill_payment";
const toolDescription = "Create a bill payment in QuickBooks Online.";

// Define the expected input schema for creating a bill payment
const toolSchema = z.object({
  billPayment: z.any(),
});

type ToolParams = z.infer<typeof toolSchema>;

// Define the tool handler
const toolHandler = async (args: any) => {
  const response = await createQuickbooksBillPayment(args.params.billPayment);

  if (response.isError) {
    return {
      content: [
        { type: "text" as const, text: `Error creating bill payment: ${response.error}` },
      ],
    };
  }

  return {
    content: [
      { type: "text" as const, text: `Bill payment created:` },
      { type: "text" as const, text: JSON.stringify(response.result) },
    ],
  };
};

export const CreateBillPaymentTool: ToolDefinition<typeof toolSchema> = {
  name: toolName,
  description: toolDescription,
  schema: toolSchema,
  handler: toolHandler,
}; 