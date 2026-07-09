import { createQuickbooksAttachable } from "../handlers/create-quickbooks-attachable.handler.js";
import { ToolDefinition } from "../types/tool-definition.js";
import { z } from "zod";

const toolName = "create_attachable";
const toolDescription =
  "Create an attachable (file attachment) in QuickBooks Online. Supply file bytes one of two ways: file_path (the server reads the file from its own disk — preferred; use for anything beyond a few KB so bytes never pass through the model) or base64_content (bytes inlined by the caller). With either, the file is uploaded to QBO's /upload endpoint. With neither, a metadata-only attachment record is created.";

const toolSchema = z.object({
  file_name: z
    .string()
    .min(1)
    .optional()
    .describe(
      "File name including extension (e.g., 'receipt.pdf'). Optional when file_path is given (defaults to that file's basename); otherwise required."
    ),
  file_path: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Absolute path to a local file the server reads directly from disk, then uploads to QBO's /upload endpoint. Preferred over base64_content for real files — the bytes are read and encoded server-side and never travel through the model context. content_type is auto-detected from the extension when omitted; file_name defaults to the basename. A leading '~/' is expanded to the home directory. Mutually exclusive with base64_content. Max 100 MB."
    ),
  note: z.string().optional().describe("Optional note describing the attachment."),
  category: z.string().optional().describe("Optional QBO attachment category."),
  content_type: z
    .string()
    .optional()
    .describe(
      "MIME content type. Required with base64_content; optional with file_path (auto-detected from the extension). Supported by QBO: application/postscript (.ai, .eps), text/csv, application/msword (.doc), application/vnd.openxmlformats-officedocument.wordprocessingml.document (.docx), image/gif, image/jpeg, image/jpg, application/vnd.oasis.opendocument.spreadsheet (.ods), application/pdf, image/png, text/rtf, image/tif, text/plain (.txt), application/vnd.ms-excel (.xls), application/vnd.openxmlformats-officedocument.spreadsheetml.sheet (.xlsx), text/xml."
    ),
  base64_content: z
    .string()
    .optional()
    .describe(
      "Optional base64-encoded file bytes. When provided, the decoded file is uploaded to QBO's /upload endpoint as multipart/form-data. Maximum 100 MB decoded. Prefer file_path for anything larger than a few KB. Mutually exclusive with file_path. Omit both to create a metadata-only attachment record."
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
