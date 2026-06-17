import { createQuickbooksSalesReceipt } from "../handlers/create-quickbooks-sales-receipt.handler.js";
import { ToolDefinition } from "../types/tool-definition.js";
import { z } from "zod";

const toolName = "create_sales_receipt";
const toolDescription = "Create a sales receipt (immediate payment sale) in QuickBooks Online.";

const lineItemSchema = z.object({
  item_ref: z.string().min(1).describe("Item ID"),
  qty: z.number().positive().describe("Quantity"),
  unit_price: z.number().nonnegative().describe("Unit price"),
  description: z.string().optional().describe("Line description"),
  tax_code_ref: z.string().min(1).optional().describe("Tax code for this line: a TaxCode Id for non-US companies (use search_tax_codes), or 'TAX'/'NON' for US companies"),
});

const toolSchema = z.object({
  customer_ref: z.string().min(1).describe("Customer ID"),
  line_items: z.array(lineItemSchema).min(1).describe("Line items"),
  payment_method_ref: z.string().optional().describe("Payment method ID"),
  deposit_to_account_ref: z.string().optional().describe("Account to deposit to"),
  txn_date: z.string().optional().describe("Transaction date (YYYY-MM-DD)"),
  doc_number: z.string().optional().describe("Document number"),
  private_note: z.string().optional().describe("Private note"),
  global_tax_calculation: z.enum(["TaxExcluded", "TaxInclusive", "NotApplicable"]).optional().describe("Non-US companies only: whether unit prices exclude or include tax"),
});

const toolHandler = async ({ params }: any) => {
  const response = await createQuickbooksSalesReceipt(params);
  if (response.isError) {
    return { content: [{ type: "text" as const, text: `Error creating sales receipt: ${response.error}` }] };
  }
  return {
    content: [
      { type: "text" as const, text: `Sales receipt created successfully:` },
      { type: "text" as const, text: JSON.stringify(response.result, null, 2) },
    ],
  };
};

export const CreateSalesReceiptTool: ToolDefinition<typeof toolSchema> = {
  name: toolName,
  description: toolDescription,
  schema: toolSchema,
  handler: toolHandler,
};
