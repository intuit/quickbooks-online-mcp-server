import { getQuickbooksInvoicePdf } from "../handlers/get-quickbooks-invoice-pdf.handler.js";
import { ToolDefinition } from "../types/tool-definition.js";
import { z } from "zod";
import fs from "fs";
import path from "path";

const toolName = "get_invoice_pdf";
const toolDescription =
  "Download a QuickBooks Online invoice as a PDF. Returns the bytes inline " +
  "(base64) by default. If output_path is supplied, the PDF is written to disk " +
  "instead — but only when the QBO_PDF_OUTPUT_DIR environment variable is set " +
  "to an allowlist directory that the resolved path must live inside.";

const toolSchema = z.object({
  invoice_id: z.string().min(1, { message: "Invoice ID is required" }),
  output_path: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Optional filesystem path where the PDF will be written. Requires the " +
        "QBO_PDF_OUTPUT_DIR environment variable to be set; the resolved path " +
        "must live inside that directory. When omitted, the PDF bytes are " +
        "returned inline as base64."
    ),
  overwrite: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      "Allow overwriting an existing file at output_path. Defaults to false; " +
        "the call fails with an error if the file already exists."
    ),
});

interface DiskWriteResult {
  ok: true;
  bytes: number;
  absolutePath: string;
}
interface DiskWriteFailure {
  ok: false;
  error: string;
}

/**
 * Resolve the caller-supplied output_path against the QBO_PDF_OUTPUT_DIR
 * allowlist. Returns an absolute path that is provably inside the allowlist,
 * or a structured error.
 *
 * Defense layers:
 *  1. Reject when QBO_PDF_OUTPUT_DIR is unset — disk writes are off by default
 *     so a misaligned caller can't write anywhere just by guessing a path.
 *  2. Resolve the *parent* directory through fs.realpathSync — this defeats
 *     symlinks that point outside the allowlist (the file itself may not yet
 *     exist, so we can't realpath it directly).
 *  3. After resolution, the absolute path must be lexically prefixed by the
 *     allowlist's own realpath (with a trailing separator to prevent
 *     /tmp/allowed-evil bypassing /tmp/allowed).
 *  4. The path must not contain a `..` segment after normalization — belt and
 *     braces in case the realpath check has a corner I missed.
 */
function resolveOutputPath(rawPath: string): { absolutePath: string } | { error: string } {
  const allowlistRaw = process.env.QBO_PDF_OUTPUT_DIR;
  if (!allowlistRaw || allowlistRaw.trim() === "") {
    return {
      error:
        "Disk writes are disabled. Set QBO_PDF_OUTPUT_DIR to an allowlist " +
        "directory in the MCP server's environment, or omit output_path to " +
        "receive the PDF inline as base64.",
    };
  }

  let allowlistReal: string;
  try {
    allowlistReal = fs.realpathSync(path.resolve(allowlistRaw));
  } catch (err) {
    // `String(err)` for Error instances yields `Error: <message>`, which is
    // good enough here and lets us skip the `err instanceof Error` branch
    // (and the dead-branch coverage gap it creates, given Node always throws
    // Error instances from fs.realpathSync).
    return {
      error: `QBO_PDF_OUTPUT_DIR (${allowlistRaw}) does not resolve: ${String(err)}`,
    };
  }

  // Reject `..` segments lexically — cheap belt-and-braces alongside the
  // realpath prefix check below.
  const normalized = path.normalize(rawPath);
  if (normalized.split(path.sep).some((seg) => seg === "..")) {
    return { error: `output_path must not contain ".." segments.` };
  }

  const absoluteCandidate = path.resolve(allowlistReal, normalized);
  const parentDir = path.dirname(absoluteCandidate);

  let parentReal: string;
  try {
    parentReal = fs.realpathSync(parentDir);
  } catch (err) {
    return {
      error: `output_path parent directory does not exist or is not accessible: ${String(err)}`,
    };
  }

  // Use path.relative to check containment without playing with trailing
  // separators. `path.relative(allowlistReal, parentReal)` returns:
  //   ''         when parentReal === allowlistReal (file directly in root)
  //   'subdir'   when parentReal is inside allowlistReal
  //   '../...'   when parentReal is outside
  //   absolute   when on a different drive/root (Windows)
  const rel = path.relative(allowlistReal, parentReal);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    return {
      error: `output_path resolves outside QBO_PDF_OUTPUT_DIR (${allowlistReal}).`,
    };
  }

  const finalPath = path.join(parentReal, path.basename(absoluteCandidate));
  return { absolutePath: finalPath };
}

function writeToDisk(
  pdf: Buffer,
  rawPath: string,
  overwrite: boolean
): DiskWriteResult | DiskWriteFailure {
  const resolved = resolveOutputPath(rawPath);
  if ("error" in resolved) {
    return { ok: false, error: resolved.error };
  }

  // 'wx' fails fast if the file exists; 'w' truncates. Caller must opt in to
  // overwrite, never the default — silently clobbering a sibling file is the
  // kind of footgun that turns "agent helped me" into "agent destroyed my
  // work".
  const flag = overwrite ? "w" : "wx";
  try {
    fs.writeFileSync(resolved.absolutePath, pdf, { flag });
  } catch (err) {
    return {
      ok: false,
      error: `Failed to write PDF to ${resolved.absolutePath}: ${String(err)}`,
    };
  }
  return { ok: true, bytes: pdf.length, absolutePath: resolved.absolutePath };
}

const toolHandler = async ({ params }: any) => {
  const { invoice_id, output_path, overwrite } = params;

  const response = await getQuickbooksInvoicePdf(invoice_id);

  if (response.isError || !response.result) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Error downloading invoice ${invoice_id} as PDF: ${response.error}`,
        },
      ],
    };
  }

  const pdf = response.result;

  if (output_path) {
    const writeResult = writeToDisk(pdf, output_path, overwrite === true);
    if (!writeResult.ok) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error writing PDF for invoice ${invoice_id}: ${writeResult.error}`,
          },
        ],
      };
    }
    return {
      content: [
        {
          type: "text" as const,
          text: `Wrote ${writeResult.bytes} bytes to ${writeResult.absolutePath}`,
        },
      ],
    };
  }

  // Inline mode: return base64 so the host can decide what to do with the
  // bytes. The MCP "resource" content type with a data URI would be even
  // nicer for binary blobs, but base64 over `text` is the lowest-common-
  // denominator that all current MCP hosts handle.
  return {
    content: [
      {
        type: "text" as const,
        text: `Invoice ${invoice_id} PDF (${pdf.length} bytes, base64-encoded below):`,
      },
      {
        type: "text" as const,
        text: pdf.toString("base64"),
      },
    ],
  };
};

export const GetInvoicePdfTool: ToolDefinition<typeof toolSchema> = {
  name: toolName,
  description: toolDescription,
  schema: toolSchema,
  handler: toolHandler,
};
