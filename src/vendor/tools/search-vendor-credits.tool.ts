import { searchQuickbooksVendorCredits } from "../handlers/search-quickbooks-vendor-credits.handler.js";
import { ToolDefinition } from "../types/tool-definition.js";
import { z } from "zod";

const toolName = "search_vendor_credits";
const toolDescription = "Search for vendor credits in QuickBooks Online.";
const toolSchema = z.object({
  vendor_ref: z.string().optional().describe("Filter by vendor ID"),
  limit: z.number().optional().describe("Maximum results"),
});

const toolHandler = async ({ params }: any) => {
  const response = await searchQuickbooksVendorCredits(params);
  if (response.isError) return { content: [{ type: "text" as const, text: `Error: ${response.error}` }] };
  return { content: [{ type: "text" as const, text: `Found ${response.result.length} vendor credit(s):` }, { type: "text" as const, text: JSON.stringify(response.result, null, 2) }] };
};

export const SearchVendorCreditsTool: ToolDefinition<typeof toolSchema> = { name: toolName, description: toolDescription, schema: toolSchema, handler: toolHandler };
