import { createQuickbooksAttachable } from "../handlers/create-quickbooks-attachable.handler.js";
import { ToolDefinition } from "../types/tool-definition.js";
import { z } from "zod";

const toolName = "create_attachable";
const toolDescription =
  "Create an attachable (file attachment) in QuickBooks Online. File content can come from file_path (a file on the machine running this server — preferred for local files of any size), file_url (an https URL the server downloads), or base64_content (inline bytes — only practical for small files). Precedence: file_url/file_path (mutually exclusive) win over base64_content. With no file source, creates a metadata-only attachment record. Max file size 100 MB (QBO limit).";

const toolSchema = z.object({
  file_name: z.string().min(1).describe("File name including extension (e.g., 'receipt.pdf')."),
  note: z.string().optional().describe("Optional note describing the attachment."),
  category: z.string().optional().describe("Optional QBO attachment category."),
  content_type: z
    .string()
    .optional()
    .describe(
      "MIME content type. Optional — when omitted it is inferred from the file extension (of file_name, file_path, or the file_url path), then, for file_url only, from the response's Content-Type header if that is a QBO-supported type. Supported by QBO: application/postscript (.ai, .eps), text/csv, application/msword (.doc), application/vnd.openxmlformats-officedocument.wordprocessingml.document (.docx), image/gif, image/jpeg, image/jpg, application/vnd.oasis.opendocument.spreadsheet (.ods), application/pdf, image/png, text/rtf, image/tif, text/plain (.txt), application/vnd.ms-excel (.xls), application/vnd.openxmlformats-officedocument.spreadsheetml.sheet (.xlsx), text/xml."
    ),
  file_path: z
    .string()
    .optional()
    .describe(
      "OS-native ABSOLUTE path to a file on the machine running this MCP server (the server runs locally and shares the filesystem with you) — on Windows pass the path exactly as-is, backslashes, spaces, drive letter and all (e.g. 'C:\\Users\\me\\Documents\\Client Files - 2026\\SIGNED Quote.pdf'). Relative paths are rejected. The file is streamed to QBO — use this for any real file instead of base64_content. Must be inside an allowed base directory (default: the user's profile directory and the OS temp directory, which cover OneDrive/SharePoint sync folders, Downloads, and agent scratchpad dirs; override with env QUICKBOOKS_ATTACHABLE_BASE_DIR as a ';'-separated list). Dotfiles/dot-directories, credential files (*.env, tokens.json), and files inside the MCP server's own directory are always denied. Mutually exclusive with file_url; either one takes precedence over base64_content."
    ),
  file_url: z
    .string()
    .optional()
    .describe(
      "HTTPS URL the server downloads and streams to QBO. Use for files reachable over the web. http, internal/loopback, and cloud-metadata addresses are rejected; max 3 redirects; download timeout 60s (env QUICKBOOKS_ATTACHABLE_URL_TIMEOUT_MS). Mutually exclusive with file_path; either one takes precedence over base64_content."
    ),
  base64_content: z
    .string()
    .optional()
    .describe(
      "Base64-encoded file bytes, uploaded as multipart/form-data. Only practical for small files (a few KB) — prefer file_path or file_url for real documents. Ignored when file_path or file_url is provided. Maximum 100 MB decoded. Omit all three sources to create a metadata-only attachment record."
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
