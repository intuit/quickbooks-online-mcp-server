import { createQuickbooksVendorCredit } from "../handlers/create-quickbooks-vendor-credit.handler.js";
import { ToolDefinition } from "../types/tool-definition.js";
import { z } from "zod";

const toolName = "create_vendor_credit";
const toolDescription =
  "Create a vendor credit in QuickBooks Online. Supports per-line sales tax (tax_code_ref) and class tracking (class_ref) the same way bills do — for companies using the global tax model (CA/UK/AU etc.), set each line's tax_code_ref and a top-level global_tax_calculation so QBO auto-calculates TxnTaxDetail.";

// Shared with update-vendor-credit.tool.ts so the two tools can never drift
// in what line shapes they accept. Amount allows 0 so existing credits with
// legitimate 0.00 lines can round-trip through update's full-line replacement.
export const vendorCreditLineItemSchema = z
  .object({
    amount: z.number().nonnegative(),
    description: z.string().optional(),
    account_ref: z.string().optional().describe("Expense account ID"),
    class_ref: z.string().optional().describe("Class ID for class tracking"),
    tax_code_ref: z
      .string()
      .optional()
      .describe("TaxCode ID for this line (e.g. an HST/GST code). Required for fiscally valid credits in non-US locales."),
    billable_status: z
      .enum(["Billable", "NotBillable", "HasBeenBilled"])
      .optional()
      .describe("Billable status of the line"),
    customer_ref: z.string().optional().describe("Customer ID the line is billable to"),
  })
  .superRefine((l, ctx) => {
    // QBO rejects Billable purchase lines without a customer — catch it locally.
    if (l.billable_status === "Billable" && !l.customer_ref) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "customer_ref is required when billable_status is 'Billable'",
        path: ["customer_ref"],
      });
    }
  });

export const globalTaxCalculationSchema = z
  .enum(["TaxExcluded", "TaxInclusive", "NotApplicable"])
  .describe("How line amounts relate to tax: TaxExcluded (tax added on top), TaxInclusive (tax within amounts), or NotApplicable. Use with per-line tax_code_ref.");

const lineItemSchema = vendorCreditLineItemSchema;

const toolSchema = z.object({
  vendor_ref: z.string().min(1).describe("Vendor ID"),
  line_items: z.array(lineItemSchema).min(1).describe("Line items"),
  txn_date: z.string().optional().describe("Transaction date (YYYY-MM-DD)"),
  doc_number: z.string().optional().describe("Document number"),
  private_note: z.string().optional().describe("Private note"),
  global_tax_calculation: globalTaxCalculationSchema.optional(),
});

const toolHandler = async ({ params }: any) => {
  const response = await createQuickbooksVendorCredit(params);
  if (response.isError) return { content: [{ type: "text" as const, text: `Error: ${response.error}` }] };
  return { content: [{ type: "text" as const, text: `Vendor credit created:` }, { type: "text" as const, text: JSON.stringify(response.result, null, 2) }] };
};

export const CreateVendorCreditTool: ToolDefinition<typeof toolSchema> = { name: toolName, description: toolDescription, schema: toolSchema, handler: toolHandler };
