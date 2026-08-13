import { updateQuickbooksVendorCredit } from "../handlers/update-quickbooks-vendor-credit.handler.js";
import { ToolDefinition } from "../types/tool-definition.js";
import { z } from "zod";
import { globalTaxCalculationSchema, vendorCreditLineItemSchema } from "./create-vendor-credit.tool.js";

const toolName = "update_vendor_credit";
const toolDescription =
  "Update a vendor credit in QuickBooks Online. Providing line_items REPLACES the entire line array (fetch the current vendor credit first if you only want to modify one line); lines support per-line tax_code_ref and class_ref like bills.";

const toolSchema = z.object({
  id: z.string().min(1).describe("Vendor Credit ID"),
  sync_token: z.string().min(1).describe("Sync token (from the latest read of this vendor credit)"),
  vendor_ref: z.string().optional().describe("Vendor ID"),
  private_note: z.string().optional().describe("Private note"),
  line_items: z
    .array(vendorCreditLineItemSchema)
    .min(1)
    .optional()
    .describe("Full replacement set of line items (replaces ALL existing lines)"),
  global_tax_calculation: globalTaxCalculationSchema.optional(),
});

const toolHandler = async ({ params }: any) => {
  const response = await updateQuickbooksVendorCredit(params);
  if (response.isError) return { content: [{ type: "text" as const, text: `Error: ${response.error}` }] };
  return { content: [{ type: "text" as const, text: `Vendor credit updated:` }, { type: "text" as const, text: JSON.stringify(response.result, null, 2) }] };
};

export const UpdateVendorCreditTool: ToolDefinition<typeof toolSchema> = { name: toolName, description: toolDescription, schema: toolSchema, handler: toolHandler };
