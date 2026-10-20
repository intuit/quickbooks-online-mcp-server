import { deleteQuickbooksDeposit } from "../handlers/delete-quickbooks-deposit.handler.js";
import { confirmationToolText } from "../helpers/confirm-flow.js";
import { ToolDefinition } from "../types/tool-definition.js";
import { z } from "zod";

const toolName = "delete_deposit";
const toolDescription =
  "Permanently deletes the deposit (cannot be undone). Two steps: call once without `confirmation_code` to get a summary and code, show the summary to the user and ask, then call again with the code.";
const toolSchema = z.object({
  id: z.string().min(1),
  confirmation_code: z.string().optional(),
});

const toolHandler = async ({ params }: any) => {
  const response = await deleteQuickbooksDeposit(params);

  if (response.isError) {
    return { content: [{ type: "text" as const, text: `Error deleting deposit: ${response.error}` }] };
  }

  return {
    content: confirmationToolText(response, "Deposit permanently deleted:").map((text) => ({ type: "text" as const, text })),
  };
};

export const DeleteDepositTool: ToolDefinition<typeof toolSchema> = {
  name: toolName,
  description: toolDescription,
  schema: toolSchema,
  handler: toolHandler,
};
