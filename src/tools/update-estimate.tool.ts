import { updateQuickbooksEstimate } from "../handlers/update-quickbooks-estimate.handler.js";
import { ToolDefinition } from "../types/tool-definition.js";
import { z } from "zod";

const toolName = "update_estimate";
const toolDescription =
  "Updates an existing estimate in QuickBooks Online by ID. Changes only the fields you send; other fields are kept. A `Line` array replaces all lines. Include every line the estimate should keep.";

const toolSchema = z.object({
  estimate_id: z.string().min(1),
  patch: z.record(z.any()),
});

const toolHandler = async ({ params }: any) => {
  const response = await updateQuickbooksEstimate(params);
  if (response.isError) {
    return { content: [{ type: "text" as const, text: `Error updating estimate: ${response.error}` }] };
  }
  return {
    content: [
      { type: "text" as const, text: `Estimate updated:` },
      { type: "text" as const, text: JSON.stringify(response.result) },
    ],
  };
};

export const UpdateEstimateTool: ToolDefinition<typeof toolSchema> = {
  name: toolName,
  description: toolDescription,
  schema: toolSchema,
  handler: toolHandler,
};
