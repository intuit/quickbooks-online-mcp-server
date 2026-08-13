import { searchQuickbooksCreditMemos } from "../handlers/search-quickbooks-credit-memos.handler.js";
import { ToolDefinition } from "../types/tool-definition.js";
import { z } from "zod";

const toolName = "search_credit_memos";
const toolDescription = "Search for credit memos in QuickBooks Online.";

const toolSchema = z.object({
  customer_ref: z.string().optional().describe("Filter by customer ID"),
  txn_date_from: z.string().optional().describe("Filter by date from (YYYY-MM-DD)"),
  txn_date_to: z.string().optional().describe("Filter by date to (YYYY-MM-DD)"),
  limit: z.number().optional().describe("Maximum results to return"),
});

const toolHandler = async ({ params }: any) => {
  const response = await searchQuickbooksCreditMemos(params);
  if (response.isError) {
    return { content: [{ type: "text" as const, text: `Error searching credit memos: ${response.error}` }] };
  }
  return {
    content: [
      { type: "text" as const, text: `Found ${response.result.length} credit memo(s):` },
      { type: "text" as const, text: JSON.stringify(response.result, null, 2) },
    ],
  };
};

export const SearchCreditMemosTool: ToolDefinition<typeof toolSchema> = {
  name: toolName,
  description: toolDescription,
  schema: toolSchema,
  handler: toolHandler,
};
