import { createQuickbooksAttachable } from "../handlers/create-quickbooks-attachable.handler.js";
import { ToolDefinition } from "../types/tool-definition.js";
import { z } from "zod";

const toolName = "create_attachable";
const toolDescription =
  "Create an attachable (file attachment) in QuickBooks Online. Without base64_content, creates a metadata-only attachment record. With base64_content, uploads the actual file bytes to QBO's /upload endpoint.";

const toolSchema = z.object({
  file_name: z.string().min(1).describe("File name including extension (e.g., 'receipt.pdf')."),
  note: z.string().optional().describe("Optional note describing the attachment."),
  category: z.string().optional().describe("Optional QBO attachment category."),
  content_type: z
    .string()
    .optional()
    .describe(
      "MIME content type. Required when base64_content is provided. Supported by QBO: application/postscript (.ai, .eps), text/csv, application/msword (.doc), application/vnd.openxmlformats-officedocument.wordprocessingml.document (.docx), image/gif, image/jpeg, image/jpg, application/vnd.oasis.opendocument.spreadsheet (.ods), application/pdf, image/png, text/rtf, image/tif, text/plain (.txt), application/vnd.ms-excel (.xls), application/vnd.openxmlformats-officedocument.spreadsheetml.sheet (.xlsx), text/xml."
    ),
  base64_content: z
    .string()
    .optional()
    .describe(
      "Optional base64-encoded file bytes. When provided, the decoded file is uploaded to QBO's /upload endpoint as multipart/form-data. Maximum 100 MB decoded. Omit to create a metadata-only attachment record."
    ),
  attachable_ref: z
    .object({
      entity_ref_type: z.string().describe("Entity type (e.g., 'Invoice', 'Bill', 'Purchase')."),
      entity_ref_value: z.string().describe("Entity ID to attach to."),
      include_on_send: z
        .boolean()
        .optional()
        .describe("If true, include this attachment when the parent entity is emailed to a customer."),
    })
    .optional()
    .describe("Optional reference to a QBO entity this file is attached to."),
});

const toolHandler = async ({ params }: any) => {
  const response = await createQuickbooksAttachable(params);
  if (response.isError) return { content: [{ type: "text" as const, text: `Error: ${response.error}` }] };
  return {
    content: [
      { type: "text" as const, text: `Attachable created:` },
      { type: "text" as const, text: JSON.stringify(response.result, null, 2) },
    ],
  };
};

export const CreateAttachableTool: ToolDefinition<typeof toolSchema> = {
  name: toolName,
  description: toolDescription,
  schema: toolSchema,
  handler: toolHandler,
};
