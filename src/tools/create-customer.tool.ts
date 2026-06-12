import { createQuickbooksCustomer } from "../handlers/create-quickbooks-customer.handler.js";
import { ToolDefinition } from "../types/tool-definition.js";
import { z } from "zod";

// Define the tool metadata
const toolName = "create_customer";
const toolDescription =
  "Create a customer in QuickBooks Online. Accepts a raw QBO Customer object (DisplayName required). Tax info for non-US companies: set PrimaryTaxIdentifier to the customer's tax registration number (e.g. EU VAT number / CIF), and optionally Taxable (boolean) and DefaultTaxCodeRef ({ value: <TaxCode Id> }) for their default sales tax code. Responses always return PrimaryTaxIdentifier masked.";

// Define the expected input schema for creating a customer
const toolSchema = z.object({
  customer: z.any(),
});

type ToolParams = z.infer<typeof toolSchema>;

// Define the tool handler
const toolHandler = async (args: any) => {
  const response = await createQuickbooksCustomer(args.params.customer);

  if (response.isError) {
    return {
      content: [
        { type: "text" as const, text: `Error creating customer: ${response.error}` },
      ],
    };
  }

  return {
    content: [
      { type: "text" as const, text: `Customer created:` },
      { type: "text" as const, text: JSON.stringify(response.result) },
    ],
  };
};

export const CreateCustomerTool: ToolDefinition<typeof toolSchema> = {
  name: toolName,
  description: toolDescription,
  schema: toolSchema,
  handler: toolHandler,
}; 