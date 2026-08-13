import { getQuickbooksTransfer } from "../handlers/get-quickbooks-transfer.handler.js";
import { ToolDefinition } from "../types/tool-definition.js";
import { z } from "zod";

const toolName = "get_transfer";
const toolDescription = "Get a transfer by ID from QuickBooks Online.";
const toolSchema = z.object({ id: z.string().min(1).describe("Transfer ID") });

const toolHandler = async ({ params }: any) => {
  const response = await getQuickbooksTransfer(params.id);
  if (response.isError) return { content: [{ type: "text" as const, text: `Error: ${response.error}` }] };
  return { content: [{ type: "text" as const, text: `Transfer found:` }, { type: "text" as const, text: JSON.stringify(response.result, null, 2) }] };
};

export const GetTransferTool: ToolDefinition<typeof toolSchema> = { name: toolName, description: toolDescription, schema: toolSchema, handler: toolHandler };
