import { downloadQuickbooksAttachment } from "../handlers/download-quickbooks-attachment.handler.js";
import { ToolDefinition } from "../types/tool-definition.js";
import { z } from "zod";
import fs from "fs";
import os from "os";
import path from "path";

const toolName = "download_attachment";
const toolDescription =
  "Download the actual FILE attached to a QuickBooks transaction (the vendor invoice on a bill, a receipt on an expense, and so on) and save it to disk, returning the path so it can be opened or read. Use search_attachables to find the attachable_id first. Files are written to the OS temp directory by default, or to QBO_ATTACHMENT_OUTPUT_DIR when that is set; output_path, if given, is resolved inside that directory. Pass inline:true instead to get the bytes back as base64 — only sensible for small files. This is the read counterpart to create_attachable.";

// Inline base64 inflates by ~33% and lands entirely in the model's context, so
// it is capped far below the 100 MB QBO limit. Disk is the sane default.
const MAX_INLINE_BYTES = 4 * 1024 * 1024;

const toolSchema = z.object({
  attachable_id: z
    .string()
    .min(1)
    .describe("Attachable ID (from search_attachables)"),
  output_path: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Optional file name or relative path for the saved file. Resolved inside the output directory (QBO_ATTACHMENT_OUTPUT_DIR, else the OS temp dir); '..' segments and paths escaping that directory are rejected. Defaults to the attachment's own file name."
    ),
  inline: z
    .boolean()
    .optional()
    .describe(
      `If true, return the bytes as base64 instead of writing to disk. Only for small files — refused above ${MAX_INLINE_BYTES} bytes.`
    ),
  overwrite: z
    .boolean()
    .optional()
    .describe("Allow replacing an existing file at the destination. Defaults to false."),
});

/** Output directory: explicit allowlist when configured, else the OS temp dir. */
function outputDir(): string {
  const configured = process.env.QBO_ATTACHMENT_OUTPUT_DIR;
  return configured && configured.trim() !== "" ? configured.trim() : os.tmpdir();
}

// Keep a caller-supplied name from escaping the output directory. Mirrors the
// containment check used by get_invoice_pdf: reject '..' lexically, then verify
// via realpath that the resolved parent really is inside the root.
export function resolveAttachmentPath(
  rawName: string,
  root: string
): { absolutePath: string } | { error: string } {
  let rootReal: string;
  try {
    rootReal = fs.realpathSync(path.resolve(root));
  } catch (err) {
    return { error: `Output directory (${root}) does not resolve: ${String(err)}` };
  }

  const normalized = path.normalize(rawName);
  if (normalized.split(path.sep).some((seg) => seg === "..")) {
    return { error: `output_path must not contain ".." segments.` };
  }
  if (path.isAbsolute(normalized)) {
    return { error: `output_path must be relative to the output directory (${rootReal}).` };
  }

  const candidate = path.resolve(rootReal, normalized);
  let parentReal: string;
  try {
    parentReal = fs.realpathSync(path.dirname(candidate));
  } catch (err) {
    return { error: `output_path parent directory does not exist: ${String(err)}` };
  }
  const rel = path.relative(rootReal, parentReal);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    return { error: `output_path resolves outside the output directory (${rootReal}).` };
  }
  return { absolutePath: path.join(parentReal, path.basename(candidate)) };
}

/** Strip directory separators and other path syntax out of a QBO file name. */
export function safeFileName(name: string): string {
  // Normalise Windows separators first so basename() strips directory parts on
  // any platform, THEN sanitise what remains. The other order turns
  // "../../etc/passwd" into the safe-but-ugly ".._.._etc_passwd".
  const base = path.posix.basename(name.replace(/\\/g, "/"));
  const cleaned = base.replace(/[\r\n\t:*?"<>|]/g, "_").trim();
  return cleaned === "" || cleaned === "." || cleaned === ".." ? "attachment" : cleaned;
}

const toolHandler = async ({ params }: any) => {
  const response = await downloadQuickbooksAttachment({ attachable_id: params.attachable_id });
  if (response.isError || !response.result) {
    return { content: [{ type: "text" as const, text: `Error downloading attachment: ${response.error}` }] };
  }
  const { meta, buffer } = response.result;

  if (params?.inline === true) {
    if (buffer.length > MAX_INLINE_BYTES) {
      return {
        content: [
          {
            type: "text" as const,
            text:
              `Refusing to return ${buffer.length} bytes inline (limit ${MAX_INLINE_BYTES}). ` +
              `Omit inline to save "${meta.fileName}" to disk instead.`,
          },
        ],
      };
    }
    return {
      content: [
        { type: "text" as const, text: JSON.stringify({ ...meta, base64: undefined }, null, 2) },
        { type: "text" as const, text: buffer.toString("base64") },
      ],
    };
  }

  const root = outputDir();
  // Default name is prefixed with the attachable id: two vendors both sending
  // "invoice.pdf" would otherwise collide (and with overwrite:true, silently).
  const defaultName = `${meta.attachableId}-${safeFileName(meta.fileName)}`;
  const resolved = resolveAttachmentPath(
    params?.output_path ? safeFileName(params.output_path) : defaultName,
    root
  );
  if ("error" in resolved) {
    return { content: [{ type: "text" as const, text: `Error: ${resolved.error}` }] };
  }
  // lstat, not existsSync: a SYMLINK at the destination must never be followed.
  // writeFileSync would write THROUGH it, straight out of the output directory
  // that resolveAttachmentPath just took care to enforce.
  let existing: fs.Stats | null = null;
  try {
    existing = fs.lstatSync(resolved.absolutePath);
  } catch {
    existing = null; // nothing there — the normal case
  }
  if (existing?.isSymbolicLink()) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Error: ${resolved.absolutePath} is a symbolic link; refusing to write through it.`,
        },
      ],
    };
  }
  if (existing && params?.overwrite !== true) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Error: ${resolved.absolutePath} already exists. Pass overwrite:true to replace it.`,
        },
      ],
    };
  }
  try {
    // "wx" fails if the path exists, closing the gap between the check above
    // and the write. On overwrite, unlink first so we replace the file rather
    // than writing through anything that appears in between.
    if (existing) fs.unlinkSync(resolved.absolutePath);
    fs.writeFileSync(resolved.absolutePath, buffer, { flag: "wx" });
  } catch (err) {
    return { content: [{ type: "text" as const, text: `Error writing the file: ${String(err)}` }] };
  }

  return {
    content: [
      { type: "text" as const, text: `Attachment saved — open or read it at this path:` },
      { type: "text" as const, text: JSON.stringify({ ...meta, path: resolved.absolutePath }, null, 2) },
    ],
  };
};

export const DownloadAttachmentTool: ToolDefinition<typeof toolSchema> = {
  name: toolName,
  description: toolDescription,
  schema: toolSchema,
  handler: toolHandler,
};
