import { updateQuickbooksCustomer } from "../handlers/update-quickbooks-customer.handler.js";
import { ToolDefinition } from "../types/tool-definition.js";
import { z } from "zod";

const toolName = "update_customer";
const toolDescription =
  "Update an existing customer in QuickBooks Online. The customer object must include Id and SyncToken (add sparse: true for a partial update). Tax info fields work as in create_customer (e.g. PrimaryTaxIdentifier for the tax registration number / EU VAT number / CIF, DefaultTaxCodeRef for the default sales tax code); responses always return PrimaryTaxIdentifier masked.";
const toolSchema = z.object({ customer: z.any() });

type ToolParams = z.infer<typeof toolSchema>;

const toolHandler = async (args: any) => {
  const response = await updateQuickbooksCustomer(args.params.customer);

  if (response.isError) {
    return {
      content: [
        { type: "text" as const, text: `Error updating customer: ${response.error}` },
      ],
    };
  }

  return {
    content: [
      { type: "text" as const, text: `Customer updated:` },
      { type: "text" as const, text: JSON.stringify(response.result) },
    ],
  };
};

export const UpdateCustomerTool: ToolDefinition<typeof toolSchema> = {
  name: toolName,
  description: toolDescription,
  schema: toolSchema,
  handler: toolHandler,
}; 