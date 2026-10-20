import { updateQuickbooksBillPayment } from "../handlers/update-quickbooks-bill-payment.handler.js";
import { ToolDefinition } from "../types/tool-definition.js";
import { z } from "zod";

const toolName = "update_bill_payment";
const toolDescription =
  "Updates a bill payment in QuickBooks Online. Changes only the fields you send in `patch`; other fields are kept. A `Line` array replaces all lines. Nested objects (e.g. BillAddr, ShipAddr, PrimaryEmailAddr) replace the whole object — send all of its sub-fields.";

const toolSchema = z.object({
  bill_payment_id: z.string().min(1),
  patch: z.record(z.any()),
});

const toolHandler = async ({ params }: any) => {
  const response = await updateQuickbooksBillPayment(params);

  if (response.isError) {
    return {
      content: [
        { type: "text" as const, text: `Error updating bill payment: ${response.error}` },
      ],
    };
  }

  return {
    content: [
      { type: "text" as const, text: `Bill payment updated:` },
      { type: "text" as const, text: JSON.stringify(response.result) },
    ],
  };
};

export const UpdateBillPaymentTool: ToolDefinition<typeof toolSchema> = {
  name: toolName,
  description: toolDescription,
  schema: toolSchema,
  handler: toolHandler,
};
