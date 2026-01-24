import { createQuickbooksPurchase } from "../handlers/create-quickbooks-purchase.handler.js";
import { ToolDefinition } from "../types/tool-definition.js";
import { z } from "zod";

const toolName = "create_purchase";
const toolDescription = "Create a purchase (expense/check) in QuickBooks Online. Requires AccountRef (bank account), PaymentType ('Cash', 'Check', or 'CreditCard'), and at least one Line item.";

// Schema for AccountBasedExpenseLineDetail (the most common line type for purchases)
const purchaseLineSchema = z.object({
  Amount: z.number(),
  Description: z.string().optional(),
  DetailType: z.literal("AccountBasedExpenseLineDetail"),
  AccountBasedExpenseLineDetail: z.object({
    AccountRef: z.object({
      value: z.string(),
      name: z.string().optional(),
    }),
    ClassRef: z.object({
      value: z.string(),
      name: z.string().optional(),
    }).optional(),
    CustomerRef: z.object({
      value: z.string(),
      name: z.string().optional(),
    }).optional(),
    BillableStatus: z.string().optional(),
    TaxCodeRef: z.object({
      value: z.string(),
    }).optional(),
  }),
});

const toolSchema = z.object({
  purchase: z.object({
    AccountRef: z.object({
      value: z.string(),
      name: z.string().optional(),
    }),
    PaymentType: z.enum(["Cash", "Check", "CreditCard"]),
    Line: z.array(purchaseLineSchema),
    EntityRef: z.object({
      value: z.string(),
      name: z.string().optional(),
      type: z.string().optional(),
    }).optional(),
    TxnDate: z.string().optional(),
    DepartmentRef: z.object({
      value: z.string(),
      name: z.string().optional(),
    }).optional(),
    PrivateNote: z.string().optional(),
  }),
});

const toolHandler = async (args: { [x: string]: any }) => {
  // Handle different argument structures from MCP SDK
  const purchase = args.purchase || args.params?.purchase || args;

  if (!purchase || !purchase.AccountRef) {
    return {
      content: [
        { type: "text" as const, text: `Error: Invalid args structure. Received keys: ${Object.keys(args).join(', ')}. Args: ${JSON.stringify(args).slice(0, 500)}` },
      ],
    };
  }

  const response = await createQuickbooksPurchase(purchase);

  if (response.isError) {
    return {
      content: [
        { type: "text" as const, text: `Error creating purchase: ${response.error}` },
      ],
    };
  }

  return {
    content: [
      { type: "text" as const, text: `Purchase created: ${JSON.stringify(response.result)}` },
    ],
  };
};

export const CreatePurchaseTool: ToolDefinition<typeof toolSchema> = {
  name: toolName,
  description: toolDescription,
  schema: toolSchema,
  handler: toolHandler,
};
