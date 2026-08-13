import { searchQuickbooksDeposits } from "../handlers/search-quickbooks-deposits.handler.js";
import { ToolDefinition } from "../types/tool-definition.js";
import { z } from "zod";

const toolName = "search_deposits";
const toolDescription = "Search for deposits in QuickBooks Online.";
const toolSchema = z.object({
  txn_date_from: z.string().optional().describe("Filter by date from"),
  txn_date_to: z.string().optional().describe("Filter by date to"),
  limit: z.number().optional().describe("Maximum results"),
});

const toolHandler = async ({ params }: any) => {
  const response = await searchQuickbooksDeposits(params);
  if (response.isError) return { content: [{ type: "text" as const, text: `Error: ${response.error}` }] };
  return { content: [{ type: "text" as const, text: `Found ${response.result.length} deposit(s):` }, { type: "text" as const, text: JSON.stringify(response.result, null, 2) }] };
};

export const SearchDepositsTool: ToolDefinition<typeof toolSchema> = { name: toolName, description: toolDescription, schema: toolSchema, handler: toolHandler };
