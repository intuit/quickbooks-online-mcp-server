import { updateQuickbooksAttachable } from "../handlers/update-quickbooks-attachable.handler.js";
import { ToolDefinition } from "../types/tool-definition.js";
import { z } from "zod";

const toolName = "update_attachable";
const toolDescription =
  "Update an existing attachable's metadata (file name, note, category, content type) in QuickBooks Online. This is metadata-only: it CANNOT replace the uploaded file bytes. To attach a different or corrected file, create a new attachable (create_attachable with file_path) and delete the old one.";
const toolSchema = z.object({
  id: z.string().min(1).describe("Attachable ID"),
  sync_token: z.string().min(1).describe("Sync token for concurrency"),
  file_name: z.string().optional().describe("Updated file name"),
  content_type: z.string().optional().describe("Updated MIME content type metadata."),
  note: z.string().optional().describe("Updated note"),
  category: z.string().optional().describe("Updated category"),
  file_path: z.string().optional().describe("Convenience: derive file_name and content_type metadata from this path. Metadata-only — does NOT read or re-upload file bytes."),
});

const toolHandler = async ({ params }: any) => {
  const response = await updateQuickbooksAttachable(params);
  if (response.isError) return { content: [{ type: "text" as const, text: `Error: ${response.error}` }] };
  return { content: [{ type: "text" as const, text: `Attachable updated:` }, { type: "text" as const, text: JSON.stringify(response.result, null, 2) }] };
};

export const UpdateAttachableTool: ToolDefinition<typeof toolSchema> = { name: toolName, description: toolDescription, schema: toolSchema, handler: toolHandler };
