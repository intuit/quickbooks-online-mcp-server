import { getQuickbooksCustomer } from "../handlers/get-quickbooks-customer.handler.js";
import { ToolDefinition } from "../types/tool-definition.js";
import { z } from "zod";

const toolName = "get_customer";
const toolDescription = "Get a customer by Id from QuickBooks Online.";
const toolSchema = z.object({ id: z.string() });

type ToolParams = z.infer<typeof toolSchema>;

const toolHandler = async (args: { [key: string]: ToolParams }) => {
  const params = args.params as ToolParams;
  const response = await getQuickbooksCustomer(params.id);

  if (response.isError) {
    return {
      content: [
        { type: "text" as const, text: `Error getting customer: ${response.error}` },
      ],
    };
  }

  return {
    content: [
      { type: "text" as const, text: `Customer:` },
      { type: "text" as const, text: JSON.stringify(response.result) },
    ],
  };
};

export const GetCustomerTool: ToolDefinition<typeof toolSchema> = {
  name: toolName,
  description: toolDescription,
  schema: toolSchema,
  handler: toolHandler,
}; 