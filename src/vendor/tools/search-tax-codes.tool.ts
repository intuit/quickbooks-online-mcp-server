import { searchQuickbooksTaxCodes } from "../handlers/search-quickbooks-tax-codes.handler.js";
import { ToolDefinition } from "../types/tool-definition.js";
import { z } from "zod";

const toolName = "search_tax_codes";
const toolDescription = "Search for tax codes in QuickBooks Online with optional filters.";
const toolSchema = z.object({
  name: z.string().optional().describe("Filter by tax code name"),
  active: z.boolean().optional().describe("Filter by active status"),
  taxable: z.boolean().optional().describe("Filter by taxable status"),
  limit: z.number().optional().describe("Maximum results to return"),
});

const toolHandler = async ({ params }: any) => {
  const response = await searchQuickbooksTaxCodes(params);
  if (response.isError) return { content: [{ type: "text" as const, text: `Error: ${response.error}` }] };
  return { content: [{ type: "text" as const, text: `Found ${response.result.length} tax codes:` }, { type: "text" as const, text: JSON.stringify(response.result, null, 2) }] };
};

export const SearchTaxCodesTool: ToolDefinition<typeof toolSchema> = { name: toolName, description: toolDescription, schema: toolSchema, handler: toolHandler };
