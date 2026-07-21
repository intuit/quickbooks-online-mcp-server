import { createQuickbooksBill } from "../handlers/create-quickbooks-bill.handler.js";
import { ToolDefinition } from "../types/tool-definition.js";
import { z } from "zod";
import { globalTaxCalculationInputSchema } from "../helpers/global-tax.js";

const toolName = "create-bill";
const toolDescription = "Create a bill in QuickBooks Online.";

const refSchema = z.object({
  value: z.string(),
  name: z.string().optional(),
});

// Explicit TxnTaxDetail so per-invoice exact-tax overrides (PercentBased:false
// TaxLine entries, e.g. tax 7.42 where 13% computes 7.43) are declared and
// therefore never stripped by schema validation. QBO honors explicit TaxLine
// overrides on current minorversions when the txn carries line TaxCodeRefs.
const txnTaxDetailSchema = z
  .object({
    TotalTax: z.number().optional(),
    TxnTaxCodeRef: refSchema.optional(),
    TaxLine: z
      .array(
        z
          .object({
            Amount: z.number().optional(),
            DetailType: z.string().optional(),
            TaxLineDetail: z
              .object({
                TaxRateRef: refSchema.optional(),
                PercentBased: z.boolean().optional(),
                TaxPercent: z.number().optional(),
                NetAmountTaxable: z.number().optional(),
              })
              .passthrough()
              .optional(),
          })
          .passthrough()
      )
      .optional(),
  })
  .passthrough();

const lineSchema = z.object({
  Amount: z.number(),
  DetailType: z.string(),
  Description: z.string().optional(),
  // Flat (legacy) — handler will auto-nest
  AccountRef: refSchema.optional(),
  // QBO-spec nested structure
  AccountBasedExpenseLineDetail: z.object({
    AccountRef: refSchema,
    BillableStatus: z.string().optional(),
    CustomerRef: refSchema.optional(),
    ClassRef: refSchema.optional(),
    TaxCodeRef: refSchema.optional(),
  }).optional(),
  // TaxCodeRef/ClassRef on item lines: without them, taxed inventory
  // purchases force TaxCodeRef=NON and lose class tracking (defect #5).
  ItemBasedExpenseLineDetail: z.object({
    ItemRef: refSchema,
    Qty: z.number().optional(),
    UnitPrice: z.number().optional(),
    BillableStatus: z.string().optional(),
    CustomerRef: refSchema.optional(),
    ClassRef: refSchema.optional(),
    TaxCodeRef: refSchema.optional(),
  }).optional(),
}).passthrough();

const toolSchema = z.object({
  bill: z.object({
    Line: z.array(lineSchema),
    VendorRef: refSchema,
    TxnDate: z.string().optional(),
    DueDate: z.string().optional(),
    DocNumber: z.string().optional(),
    PrivateNote: z.string().optional(),
    APAccountRef: refSchema.optional(),
    CurrencyRef: refSchema.optional(),
    ExchangeRate: z.number().optional(),
    DepartmentRef: refSchema.optional(),
    // Declared explicitly (not left to passthrough) so schema validation can
    // never strip them — undeclared fields silently vanishing is exactly how
    // GlobalTaxCalculation was lost on create (defect #1).
    GlobalTaxCalculation: globalTaxCalculationInputSchema.optional(),
    TxnTaxDetail: txnTaxDetailSchema.optional(),
    Balance: z.number().optional(),
    TotalAmt: z.number().optional(),
  }).passthrough(),
});

const toolHandler = async (args: { [x: string]: any }) => {
  const response = await createQuickbooksBill(args.params.bill);
  if (response.isError) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Error creating bill: ${response.error}`,
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

export const CreateBillTool: ToolDefinition<typeof toolSchema> = {
  name: toolName,
  description: toolDescription,
  schema: toolSchema,
  handler: toolHandler,
};