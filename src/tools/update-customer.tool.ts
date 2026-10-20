import { updateQuickbooksCustomer } from "../handlers/update-quickbooks-customer.handler.js";
import { ToolDefinition } from "../types/tool-definition.js";
import { z } from "zod";

const toolName = "update_customer";
const toolDescription =
  "Updates an existing customer in QuickBooks Online. Tax info fields work as in create_customer (e.g. PrimaryTaxIdentifier, DefaultTaxCodeRef); responses always return PrimaryTaxIdentifier masked. Changes only the fields you send in `patch`; other fields are kept. Nested objects (e.g. BillAddr, ShipAddr, PrimaryEmailAddr) replace the whole object — send all of its sub-fields.";

const toolSchema = z.object({
  customer_id: z.string().min(1),
  patch: z.record(z.any()),
});

const toolHandler = async ({ params }: any) => {
  const response = await updateQuickbooksCustomer(params);

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
