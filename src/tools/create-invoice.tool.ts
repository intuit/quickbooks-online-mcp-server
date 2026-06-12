import { createQuickbooksInvoice } from "../handlers/create-quickbooks-invoice.handler.js";
import { ToolDefinition } from "../types/tool-definition.js";
import { z } from "zod";

const toolName = "create_invoice";
const toolDescription = "Create an invoice in QuickBooks Online.";

const lineItemSchema = z.object({
  item_ref: z.string().min(1),
  qty: z.number().positive(),
  unit_price: z.number().nonnegative(),
  description: z.string().optional(),
  tax_code_ref: z
    .string()
    .optional()
    .describe(
      "Tax code applied to this line. For non-US companies, the Id of a TaxCode entity (use search_tax_codes to list them, e.g. a 0% intra-EU code). For US companies, 'TAX' or 'NON'."
    ),
});

const toolSchema = z.object({
  customer_ref: z.string().min(1),
  line_items: z.array(lineItemSchema).min(1),
  doc_number: z.string().optional(),
  txn_date: z.string().optional(),
  global_tax_calculation: z
    .enum(["TaxExcluded", "TaxInclusive", "NotApplicable"])
    .optional()
    .describe(
      "Non-US companies only: whether line amounts are tax-exclusive (TaxExcluded, default) or tax-inclusive (TaxInclusive)."
    ),
});

const toolHandler = async ({ params }: any) => {
  const response = await createQuickbooksInvoice(params);
  if (response.isError) {
    return { content: [{ type: "text" as const, text: `Error creating invoice: ${response.error}` }] };
  }
  return {
    content: [
      { type: "text" as const, text: `Invoice created successfully:` },
      { type: "text" as const, text: JSON.stringify(response.result, null, 2) },
    ],
  };
};

export const CreateInvoiceTool: ToolDefinition<typeof toolSchema> = {
  name: toolName,
  description: toolDescription,
  schema: toolSchema,
  handler: toolHandler,
}; 