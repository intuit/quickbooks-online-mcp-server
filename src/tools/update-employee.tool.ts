import { updateQuickbooksEmployee } from "../handlers/update-quickbooks-employee.handler.js";
import { ToolDefinition } from "../types/tool-definition.js";
import { z } from "zod";

const toolName = "update_employee";
const toolDescription =
  "Updates an employee in QuickBooks Online. Changes only the fields you send in `patch`; other fields are kept. Nested objects (e.g. BillAddr, ShipAddr, PrimaryEmailAddr) replace the whole object — send all of its sub-fields.";

const toolSchema = z.object({
  employee_id: z.string().min(1),
  patch: z.record(z.any()),
});

const toolHandler = async ({ params }: any) => {
  const response = await updateQuickbooksEmployee(params);

  if (response.isError) {
    return {
      content: [
        { type: "text" as const, text: `Error updating employee: ${response.error}` },
      ],
    };
  }

  return {
    content: [
      { type: "text" as const, text: `Employee updated:` },
      { type: "text" as const, text: JSON.stringify(response.result) },
    ],
  };
};

export const UpdateEmployeeTool: ToolDefinition<typeof toolSchema> = {
  name: toolName,
  description: toolDescription,
  schema: toolSchema,
  handler: toolHandler,
};
