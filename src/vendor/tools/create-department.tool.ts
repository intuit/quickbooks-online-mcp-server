import { createQuickbooksDepartment } from "../handlers/create-quickbooks-department.handler.js";
import { ToolDefinition } from "../types/tool-definition.js";
import { z } from "zod";

const toolName = "create_department";
const toolDescription = "Create a new department in QuickBooks Online for location/department tracking.";
const toolSchema = z.object({
  name: z.string().min(1).describe("Department name"),
  parent_ref: z.string().optional().describe("Parent department ID for sub-departments"),
});

const toolHandler = async ({ params }: any) => {
  const response = await createQuickbooksDepartment(params);
  if (response.isError) return { content: [{ type: "text" as const, text: `Error: ${response.error}` }] };
  return { content: [{ type: "text" as const, text: `Department created:` }, { type: "text" as const, text: JSON.stringify(response.result, null, 2) }] };
};

export const CreateDepartmentTool: ToolDefinition<typeof toolSchema> = { name: toolName, description: toolDescription, schema: toolSchema, handler: toolHandler };
