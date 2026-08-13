import { getQuickbooksEstimate } from "../handlers/get-quickbooks-estimate.handler.js";
import { ToolDefinition } from "../types/tool-definition.js";
import { z } from "zod";

const toolName = "get_estimate";
const toolDescription = "Get an estimate by Id from QuickBooks Online.";
const toolSchema = z.object({ id: z.string() });

const toolHandler = async (args: any) => {
  const response = await getQuickbooksEstimate(args.params.id);
  if (response.isError) {
    return { content: [{ type: "text" as const, text: `Error getting estimate: ${response.error}` }] };
  }
  return {
    content: [
      { type: "text" as const, text: `Estimate:` },
      { type: "text" as const, text: JSON.stringify(response.result) },
    ],
  };
};

export const GetEstimateTool: ToolDefinition<typeof toolSchema> = {
  name: toolName,
  description: toolDescription,
  schema: toolSchema,
  handler: toolHandler,
}; 