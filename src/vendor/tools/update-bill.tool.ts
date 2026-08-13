import { updateQuickbooksBill } from "../handlers/update-quickbooks-bill.handler.js";
import { ToolDefinition } from "../types/tool-definition.js";
import { z } from "zod";

const toolName = "update-bill";
const toolDescription =
  "Update a bill in QuickBooks Online. Performs a read-merge-write: the current bill " +
  "is fetched and your changes are merged over it, so line-level ClassRef/TaxCodeRef " +
  "and any other fields you omit are preserved (QBO bill updates are full overwrites). " +
  "Pass bill.Id plus only the fields to change. Match an existing line by its Id; a line " +
  "without an Id is added as a new line. SyncToken is optional — the latest is fetched " +
  "automatically.";

const refSchema = z.object({
  value: z.string(),
  name: z.string().optional(),
});

const lineSchema = z
  .object({
    Id: z.string().optional(), // present → merge into existing line; absent → new line
    Amount: z.number().optional(),
    DetailType: z.string().optional(),
    Description: z.string().optional(),
    AccountBasedExpenseLineDetail: z
      .object({
        AccountRef: refSchema.optional(),
        ClassRef: refSchema.optional(),
        TaxCodeRef: refSchema.optional(),
        BillableStatus: z.string().optional(),
        CustomerRef: refSchema.optional(),
      })
      .passthrough()
      .optional(),
    ItemBasedExpenseLineDetail: z
      .object({
        ItemRef: refSchema,
        ClassRef: refSchema.optional(),
        TaxCodeRef: refSchema.optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

const toolSchema = z.object({
  bill: z
    .object({
      Id: z.string(),
      SyncToken: z.string().optional(),
      DocNumber: z.string().optional(),
      Line: z.array(lineSchema).optional(),
      VendorRef: refSchema.optional(),
      DueDate: z.string().optional(),
      TxnDate: z.string().optional(),
      PrivateNote: z.string().optional(),
      Balance: z.number().optional(),
      TotalAmt: z.number().optional(),
    })
    .passthrough(),
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
      },
    ],
  };
};

export const UpdateBillTool: ToolDefinition<typeof toolSchema> = {
  name: toolName,
  description: toolDescription,
  schema: toolSchema,
  handler: toolHandler,
};
