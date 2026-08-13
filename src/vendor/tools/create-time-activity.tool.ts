import { createQuickbooksTimeActivity } from "../handlers/create-quickbooks-time-activity.handler.js";
import { ToolDefinition } from "../types/tool-definition.js";
import { z } from "zod";

const toolName = "create_time_activity";
const toolDescription = "Create a time activity (time tracking entry) in QuickBooks Online.";
const toolSchema = z.object({
  name_of: z.enum(["Vendor", "Employee"]).describe("Whether time is for vendor or employee"),
  vendor_ref: z.string().optional().describe("Vendor ID (if name_of is Vendor)"),
  employee_ref: z.string().optional().describe("Employee ID (if name_of is Employee)"),
  customer_ref: z.string().optional().describe("Customer ID for billing"),
  item_ref: z.string().optional().describe("Service item ID"),
  hours: z.number().optional().describe("Hours worked"),
  minutes: z.number().optional().describe("Minutes worked"),
  txn_date: z.string().optional().describe("Date (YYYY-MM-DD)"),
  description: z.string().optional().describe("Description of work"),
  billable_status: z.enum(["Billable", "NotBillable", "HasBeenBilled"]).optional().describe("Billable status"),
  hourly_rate: z.number().optional().describe("Hourly rate"),
});

const toolHandler = async ({ params }: any) => {
  const response = await createQuickbooksTimeActivity(params);
  if (response.isError) return { content: [{ type: "text" as const, text: `Error: ${response.error}` }] };
  return { content: [{ type: "text" as const, text: `Time activity created:` }, { type: "text" as const, text: JSON.stringify(response.result, null, 2) }] };
};

export const CreateTimeActivityTool: ToolDefinition<typeof toolSchema> = { name: toolName, description: toolDescription, schema: toolSchema, handler: toolHandler };
