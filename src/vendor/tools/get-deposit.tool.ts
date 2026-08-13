import { getQuickbooksDeposit } from "../handlers/get-quickbooks-deposit.handler.js";
import { ToolDefinition } from "../types/tool-definition.js";
import { z } from "zod";

const toolName = "get_deposit";
const toolDescription = "Get a deposit by ID from QuickBooks Online.";
const toolSchema = z.object({ id: z.string().min(1).describe("Deposit ID") });

const toolHandler = async ({ params }: any) => {
  const response = await getQuickbooksDeposit(params.id);
  if (response.isError) return { content: [{ type: "text" as const, text: `Error: ${response.error}` }] };
  return { content: [{ type: "text" as const, text: `Deposit found:` }, { type: "text" as const, text: JSON.stringify(response.result, null, 2) }] };
};

export const GetDepositTool: ToolDefinition<typeof toolSchema> = { name: toolName, description: toolDescription, schema: toolSchema, handler: toolHandler };
