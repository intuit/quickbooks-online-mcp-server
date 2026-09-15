import { getQuickbooksAttachable } from "../handlers/get-quickbooks-attachable.handler.js";
import { ToolDefinition } from "../types/tool-definition.js";
import { z } from "zod";
import { applyDownloadUriPolicy } from "../helpers/download-uri.js";

const toolName = "get_attachable";
const toolDescription = "Retrieve a specific attachable from QuickBooks Online by ID.";
const toolSchema = z.object({
  return_download_uri: z
    .boolean()
    .optional()
    .describe(
      "If true, include TempDownloadUri (a multi-KB pre-signed URL) in the response. Omitted by default to keep responses small - use download_attachment to fetch the file itself."
    ),
  id: z.string().min(1).describe("Attachable ID"),
});

const toolHandler = async ({ params }: any) => {
  const response = await getQuickbooksAttachable(params.id);
  if (response.isError) return { content: [{ type: "text" as const, text: `Error: ${response.error}` }] };
  return { content: [{ type: "text" as const, text: JSON.stringify(applyDownloadUriPolicy(response.result, params?.return_download_uri), null, 2) }] };
};

export const GetAttachableTool: ToolDefinition<typeof toolSchema> = { name: toolName, description: toolDescription, schema: toolSchema, handler: toolHandler };
