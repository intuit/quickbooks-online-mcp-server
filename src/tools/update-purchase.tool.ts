import { updateQuickbooksPurchase } from "../handlers/update-quickbooks-purchase.handler.js";
import { ToolDefinition } from "../types/tool-definition.js";
import { z } from "zod";

const toolName = "update_purchase";
const toolDescription =
  "Update a purchase (expense, check or credit card charge) in QuickBooks Online. " +
  "Changes only the fields you send in `patch`; other fields are kept. A `Line` array replaces all lines.";

const toolSchema = z.object({
  purchase_id: z.string().min(1),
  patch: z.record(z.any()),
});

const toolHandler = async ({ params }: any) => {
  const response = await updateQuickbooksPurchase(params);

  if (response.isError) {
    return {
      content: [
        { type: "text" as const, text: `Error updating purchase: ${response.error}` },
      ],
    };
  }

  return {
    content: [
      { type: "text" as const, text: `Purchase updated:` },
      { type: "text" as const, text: JSON.stringify(response.result) },
    ],
  };
};

export const UpdatePurchaseTool: ToolDefinition<typeof toolSchema> = {
  name: toolName,
  description: toolDescription,
  schema: toolSchema,
  handler: toolHandler,
};
