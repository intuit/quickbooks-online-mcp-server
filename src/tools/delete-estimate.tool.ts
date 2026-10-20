import { deleteQuickbooksEstimate } from "../handlers/delete-quickbooks-estimate.handler.js";
import { confirmationToolText } from "../helpers/confirm-flow.js";
import { ToolDefinition } from "../types/tool-definition.js";
import { z } from "zod";

const toolName = "delete_estimate";
const toolDescription =
  "Permanently deletes the estimate (cannot be undone). Two steps: call once without `confirmation_code` to get a summary and code, show the summary to the user and ask, then call again with the code.";
const toolSchema = z.object({
  id: z.string().min(1),
  confirmation_code: z.string().optional(),
});

const toolHandler = async ({ params }: any) => {
  const response = await deleteQuickbooksEstimate(params);

  if (response.isError) {
    return { content: [{ type: "text" as const, text: `Error deleting estimate: ${response.error}` }] };
  }

  return {
    content: confirmationToolText(response, "Estimate permanently deleted:").map((text) => ({ type: "text" as const, text })),
  };
};

export const DeleteEstimateTool: ToolDefinition<typeof toolSchema> = {
  name: toolName,
  description: toolDescription,
  schema: toolSchema,
  handler: toolHandler,
};
