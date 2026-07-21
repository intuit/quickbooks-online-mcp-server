import { createQuickbooksPurchase } from "../handlers/create-quickbooks-purchase.handler.js";
import { ToolDefinition } from "../types/tool-definition.js";
import { z } from "zod";
import { globalTaxCalculationInputSchema } from "../helpers/global-tax.js";

// Define the tool metadata
const toolName = "create_purchase";
const toolDescription =
  "Create a purchase (expense/cheque/credit-card charge) in QuickBooks Online. For companies on the global tax model (CA/UK/AU), set line-level TaxCodeRef and a top-level GlobalTaxCalculation (TaxExcluded adds tax on top of line amounts; TaxInclusive extracts it from them). An explicit TxnTaxDetail with PercentBased:false TaxLine entries overrides QBO's computed tax for exact per-document amounts.";

const refSchema = z.object({ value: z.string(), name: z.string().optional() });

// The previous schema was `purchase: z.any()` — with no declared properties,
// fields like GlobalTaxCalculation were silently stripped before the handler
// ran (defect #1: TaxInclusive purchases posted as NotApplicable). Every
// forwardable field is now declared explicitly; passthrough keeps the schema
// open for the long tail of QBO Purchase fields.
const purchaseLineSchema = z
  .object({
    Amount: z.number(),
    DetailType: z.string(),
    Description: z.string().optional(),
    AccountBasedExpenseLineDetail: z
      .object({
        AccountRef: refSchema,
        BillableStatus: z.string().optional(),
        CustomerRef: refSchema.optional(),
        ClassRef: refSchema.optional(),
        TaxCodeRef: refSchema.optional(),
      })
      .passthrough()
      .optional(),
    ItemBasedExpenseLineDetail: z
      .object({
        ItemRef: refSchema,
        Qty: z.number().optional(),
        UnitPrice: z.number().optional(),
        BillableStatus: z.string().optional(),
        CustomerRef: refSchema.optional(),
        ClassRef: refSchema.optional(),
        TaxCodeRef: refSchema.optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

const toolSchema = z.object({
  purchase: z
    .object({
      PaymentType: z.enum(["Cash", "Check", "CreditCard"]).optional(),
      AccountRef: refSchema.optional().describe("Bank/credit account the purchase is paid from"),
      EntityRef: refSchema.optional().describe("Payee (vendor/customer/employee)"),
      Line: z.array(purchaseLineSchema),
      TxnDate: z.string().optional(),
      DocNumber: z.string().optional(),
      PrivateNote: z.string().optional(),
      CurrencyRef: refSchema.optional(),
      ExchangeRate: z.number().optional(),
      DepartmentRef: refSchema.optional(),
      GlobalTaxCalculation: globalTaxCalculationInputSchema.optional(),
      TxnTaxDetail: z
        .object({
          TotalTax: z.number().optional(),
          TaxLine: z.array(z.object({}).passthrough()).optional(),
        })
        .passthrough()
        .optional(),
    })
    .passthrough(),
});

type ToolParams = z.infer<typeof toolSchema>;

// Define the tool handler
const toolHandler = async (args: any) => {
  const response = await createQuickbooksPurchase(args.params.purchase);

  if (response.isError) {
    return {
      content: [
        { type: "text" as const, text: `Error creating purchase: ${response.error}` },
      ],
    };
  }

  return {
    content: [
      { type: "text" as const, text: `Purchase created:` },
      { type: "text" as const, text: JSON.stringify(response.result) },
    ],
  };
};

export const CreatePurchaseTool: ToolDefinition<typeof toolSchema> = {
  name: toolName,
  description: toolDescription,
  schema: toolSchema,
  handler: toolHandler,
};
