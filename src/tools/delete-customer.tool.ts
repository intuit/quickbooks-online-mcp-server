import { deleteQuickbooksCustomer } from "../handlers/delete-quickbooks-customer.handler.js";
import { ToolDefinition } from "../types/tool-definition.js";
import { z } from "zod";

const toolName = "delete_customer";
const toolDescription = "Marks the customer inactive (can be undone in QuickBooks).";
const toolSchema = z.object({ id: z.string().min(1) });

const toolHandler = async ({ params }: any) => {
  const response = await deleteQuickbooksCustomer(params.id);

  if (response.isError) {
    return { content: [{ type: "text" as const, text: `Error marking customer inactive: ${response.error}` }] };
  }

  return {
    content: [
      { type: "text" as const, text: `Customer marked inactive:` },
      { type: "text" as const, text: JSON.stringify(response.result) },
    ],
  };
};

export const DeleteCustomerTool: ToolDefinition<typeof toolSchema> = {
  name: toolName,
  description: toolDescription,
  schema: toolSchema,
  handler: toolHandler,
};
