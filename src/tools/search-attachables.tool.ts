import { searchQuickbooksAttachables } from "../handlers/search-quickbooks-attachables.handler.js";
import { ToolDefinition } from "../types/tool-definition.js";
import { z } from "zod";
import { applyDownloadUriPolicy } from "../helpers/download-uri.js";

const toolName = "search_attachables";
const toolDescription = "Search for attachables in QuickBooks Online with optional filters.";
const toolSchema = z.object({
  return_download_uri: z
    .boolean()
    .optional()
    .describe(
      "If true, include TempDownloadUri (a multi-KB pre-signed URL) in the response. Omitted by default to keep responses small - use download_attachment to fetch the file itself."
    ),
  file_name: z.string().optional().describe("Filter by file name"),
  content_type: z.string().optional().describe("Filter by content type"),
  limit: z.number().optional().describe("Maximum results to return"),
});

const toolHandler = async ({ params }: any) => {
  const response = await searchQuickbooksAttachables(params);
  if (response.isError) return { content: [{ type: "text" as const, text: `Error: ${response.error}` }] };
  return { content: [{ type: "text" as const, text: `Found ${response.result.length} attachables:` }, { type: "text" as const, text: JSON.stringify(applyDownloadUriPolicy(response.result, params?.return_download_uri), null, 2) }] };
};

export const SearchAttachablesTool: ToolDefinition<typeof toolSchema> = { name: toolName, description: toolDescription, schema: toolSchema, handler: toolHandler };
