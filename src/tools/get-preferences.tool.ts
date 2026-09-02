import { z } from "zod";
import { getQuickbooksPreferences } from "../handlers/get-quickbooks-preferences.handler.js";
import { ToolDefinition } from "../types/tool-definition.js";

const toolName = "get_preferences";
const toolDescription =
  "Retrieve company preferences from QuickBooks Online, including accounting method, class and department tracking, and purchase order settings.";
const toolSchema = z.object({});

const toolHandler = async () => {
  const response = await getQuickbooksPreferences();
  if (response.isError) return { content: [{ type: "text" as const, text: `Error: ${response.error}` }] };
  return { content: [{ type: "text" as const, text: JSON.stringify(response.result, null, 2) }] };
};

export const GetPreferencesTool: ToolDefinition<typeof toolSchema> = {
  name: toolName,
  description: toolDescription,
  schema: toolSchema,
  handler: toolHandler,
};
