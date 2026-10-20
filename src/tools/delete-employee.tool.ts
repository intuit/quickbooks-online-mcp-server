import { deleteQuickbooksEmployee } from "../handlers/delete-quickbooks-employee.handler.js";
import { ToolDefinition } from "../types/tool-definition.js";
import { z } from "zod";

const toolName = "delete_employee";
const toolDescription = "Marks the employee inactive (can be undone in QuickBooks).";
const toolSchema = z.object({ id: z.string().min(1) });

const toolHandler = async ({ params }: any) => {
  const response = await deleteQuickbooksEmployee(params.id);

  if (response.isError) {
    return { content: [{ type: "text" as const, text: `Error marking employee inactive: ${response.error}` }] };
  }

  return {
    content: [
      { type: "text" as const, text: `Employee marked inactive:` },
      { type: "text" as const, text: JSON.stringify(response.result) },
    ],
  };
};

export const DeleteEmployeeTool: ToolDefinition<typeof toolSchema> = {
  name: toolName,
  description: toolDescription,
  schema: toolSchema,
  handler: toolHandler,
};
