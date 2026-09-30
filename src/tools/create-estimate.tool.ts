import { createQuickbooksEstimate } from "../handlers/create-quickbooks-estimate.handler.js";
import { ToolDefinition } from "../types/tool-definition.js";
import { z } from "zod";

const toolName = "create_estimate";
const toolDescription = "Create an estimate (devis) in QuickBooks Online.";

const lineItemSchema = z.object({
  item_ref: z.string().min(1),
  qty: z.number().positive(),
  unit_price: z.number().nonnegative(),
  description: z.string().optional(),
  tax_code_ref: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Tax code for this line: a TaxCode Id for non-US companies (use search_tax_codes), or 'TAX'/'NON' for US companies"
    ),
  service_date: z
    .string()
    .min(1)
    .optional()
    .describe("Date the service was performed (YYYY-MM-DD), shown per line on the estimate"),
});

const toolSchema = z.object({
  customer_ref: z.string().min(1),
  line_items: z.array(lineItemSchema).min(1),
  doc_number: z.string().optional(),
  txn_date: z.string().optional(),
  expiration_date: z
    .string()
    .optional()
    .describe("Estimate expiration date (YYYY-MM-DD). Used for prepaid banks (e.g. +18 months)"),
  txn_status: z
    .enum(["Pending", "Accepted", "Closed", "Rejected"])
    .optional()
    .describe("Estimate status; defaults to Pending in QBO if omitted"),
  global_tax_calculation: z
    .enum(["TaxExcluded", "TaxInclusive", "NotApplicable"])
    .optional()
    .describe("Non-US companies only: whether unit prices exclude or include tax"),
  customer_memo: z
    .string()
    .min(1)
    .optional()
    .describe("Customer-facing message printed on the estimate (QBO CustomerMemo)"),
  sales_term_ref: z
    .string()
    .min(1)
    .optional()
    .describe("Sales term Id (use search_terms), e.g. Net 30. Falls back to the customer default if omitted"),
  bill_email: z
    .string()
    .min(1)
    .optional()
    .describe("Billing email address (QBO BillEmail). Falls back to the customer default if omitted"),
  private_note: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Internal memo, not shown to the customer (QBO PrivateNote). Use customer_memo for text the customer should see"
    ),
});

const toolHandler = async ({ params }: any) => {
  const response = await createQuickbooksEstimate(params);
  if (response.isError) {
    return { content: [{ type: "text" as const, text: `Error creating estimate: ${response.error}` }] };
  }
  return {
    content: [
      { type: "text" as const, text: `Estimate created successfully:` },
      { type: "text" as const, text: JSON.stringify(response.result, null, 2) },
    ],
  };
};

export const CreateEstimateTool: ToolDefinition<typeof toolSchema> = {
  name: toolName,
  description: toolDescription,
  schema: toolSchema,
  handler: toolHandler,
};
