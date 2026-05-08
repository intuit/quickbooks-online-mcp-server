import { updateQuickbooksBill } from "../handlers/update-quickbooks-bill.handler.js";
import { ToolDefinition } from "../types/tool-definition.js";
import { z } from "zod";

const toolName = "update-bill";
const toolDescription = "Update a bill in QuickBooks Online.";
const toolSchema = z.object({
  bill: z.object({
    Id: z.string(),
    SyncToken: z.string(),
    DocNumber: z.string().optional(),
    Line: z.array(z.object({
      Amount: z.number(),
      DetailType: z.string(),
      Description: z.string(),
      AccountBasedExpenseLineDetail: z.object({
        AccountRef: z.object({
          value: z.string(),
          name: z.string().optional(),
        }),
      }),
    })),
    VendorRef: z.object({
      value: z.string(),
      name: z.string().optional(),
    }),
    DueDate: z.string(),
    Balance: z.number(),
    TotalAmt: z.number(),
  }),
});

const toolHandler = async (args: { [x: string]: any }) => {
  const response = await updateQuickbooksBill(args.params.bill);

  if (response.isError) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Error updating bill: ${response.error}`,
        },
      ],
    };
  }

  const bill = response.result;

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(bill),
      }
    ],
  };
};

export const UpdateBillTool: ToolDefinition<typeof toolSchema> = {
  name: toolName,
  description: toolDescription,
  schema: toolSchema,
  handler: toolHandler,
}; 