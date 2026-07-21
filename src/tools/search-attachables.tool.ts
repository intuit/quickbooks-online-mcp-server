import { searchQuickbooksAttachables } from "../handlers/search-quickbooks-attachables.handler.js";
import { ToolDefinition } from "../types/tool-definition.js";
import { z } from "zod";

const toolName = "search_attachables";
const toolDescription =
  "Search for attachables in QuickBooks Online. Returns newest-first by default (orderby MetaData.CreateTime DESC). Supports pagination (limit/offset) and created-date range filters. To find the attachments of a specific transaction, prefer get_entity_attachments.";
const toolSchema = z.object({
  file_name: z.string().optional().describe("Filter by file name (exact match; use file_name_like for contains)"),
  file_name_like: z.string().optional().describe("Filter by file name substring (LIKE '%value%')"),
  content_type: z.string().optional().describe("Filter by content type"),
  created_after: z.string().optional().describe("Only attachables created on/after this ISO date (MetaData.CreateTime >=)"),
  created_before: z.string().optional().describe("Only attachables created on/before this ISO date (MetaData.CreateTime <=)"),
  limit: z.number().optional().describe("Maximum results to return (default 1000)"),
  offset: z.number().optional().describe("1-based start position for pagination (QBO STARTPOSITION)"),
  orderby: z
    .string()
    .optional()
    .describe("Field to order by, optionally with direction, e.g. 'MetaData.CreateTime DESC' (the default) or 'FileName ASC'"),
});

const toolHandler = async ({ params }: any) => {
  const response = await searchQuickbooksAttachables(params);
  if (response.isError) return { content: [{ type: "text" as const, text: `Error: ${response.error}` }] };
  return { content: [{ type: "text" as const, text: `Found ${response.result.length} attachables:` }, { type: "text" as const, text: JSON.stringify(response.result, null, 2) }] };
};

export const SearchAttachablesTool: ToolDefinition<typeof toolSchema> = { name: toolName, description: toolDescription, schema: toolSchema, handler: toolHandler };
