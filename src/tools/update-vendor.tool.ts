import { updateQuickbooksVendor } from "../handlers/update-quickbooks-vendor.handler.js";
import { ToolDefinition } from "../types/tool-definition.js";
import { z } from "zod";

const toolName = "update-vendor";
const toolDescription = "Update a vendor in QuickBooks Online.";
const toolSchema = z.object({
  vendor: z.object({
    Id: z.string(),
    SyncToken: z.string(),
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
  }),
});

const toolHandler = async (args: { [x: string]: any }) => {
  const response = await updateQuickbooksVendor(args.params.vendor);

  if (response.isError) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Error updating vendor: ${response.error}`,
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

export const UpdateVendorTool: ToolDefinition<typeof toolSchema> = {
  name: toolName,
  description: toolDescription,
  schema: toolSchema,
  handler: toolHandler,
}; 