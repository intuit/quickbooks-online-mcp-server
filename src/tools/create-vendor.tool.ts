import { createQuickbooksVendor } from "../handlers/create-quickbooks-vendor.handler.js";
import { ToolDefinition } from "../types/tool-definition.js";
import { z } from "zod";

const toolName = "create-vendor";
const toolDescription = "Create a vendor in QuickBooks Online.";
const toolSchema = z.object({
  vendor: z.object({
    DisplayName: z.string(),
    GivenName: z.string().optional(),
    FamilyName: z.string().optional(),
    CompanyName: z.string().optional(),
    PrimaryEmailAddr: z.object({
      Address: z.string().optional(),
    }).optional(),
    PrimaryPhone: z.object({
      FreeFormNumber: z.string().optional(),
    }).optional(),
    BillAddr: z.object({
      Line1: z.string().optional(),
      City: z.string().optional(),
      Country: z.string().optional(),
      CountrySubDivisionCode: z.string().optional(),
      PostalCode: z.string().optional(),
    }).optional(),
    // Vendor currency drives transaction currency and CANNOT be changed after
    // the vendor's first use — it must be settable at create (defect #15).
    CurrencyRef: z.object({ value: z.string(), name: z.string().optional() }).optional()
      .describe("Vendor currency (e.g. {value:'USD'}). Immutable after first transaction — set it now."),
    TermRef: z.object({ value: z.string(), name: z.string().optional() }).optional()
      .describe("Default payment terms"),
    TaxIdentifier: z.string().optional().describe("Vendor tax ID (BN/EIN/VAT number)"),
    Vendor1099: z.boolean().optional().describe("Whether the vendor is 1099-eligible (US)"),
  }).passthrough(),
});

const toolHandler = async (args: { [x: string]: any }) => {
  const response = await createQuickbooksVendor(args.params.vendor);

  if (response.isError) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Error creating vendor: ${response.error}`,
        },
      ],
    };
  }

  const vendor = response.result;

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(vendor),
      }
    ],
  };
};

export const CreateVendorTool: ToolDefinition<typeof toolSchema> = {
  name: toolName,
  description: toolDescription,
  schema: toolSchema,
  handler: toolHandler,
}; 