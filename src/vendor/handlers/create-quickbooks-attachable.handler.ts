import https from "https";
import { createReadStream } from "fs";
import { QuickbooksClient } from "../clients/quickbooks-client.js";
import { ToolResponse } from "../types/tool-response.js";
import { formatError } from "../helpers/format-error.js";
import {
  fetchUrlToTempFile,
  inferContentType,
  resolveLocalFile,
} from "../helpers/attachable-file-source.js";

// QBO Attachable upload — file types accepted by the QBO /upload endpoint.
// Source: developer.intuit.com Attachable API reference (16 unique MIME types
// covering 17 documented file extensions; .ai and .eps both map to
// application/postscript).
//
// Two entries deviate from RFC standards but match QBO's documented spec
// literally — keep them so payloads round-trip without QBO rejecting them:
//   - image/jpg  (RFC standard is image/jpeg; QBO accepts both)
//   - image/tif  (RFC standard is image/tiff; QBO accepts both)
//
// One entry is corrected from a documentation typo:
//   - QBO docs list application/vnd/ms-excel for .xls. A forward slash in a
//     MIME subtype is invalid per RFC 6838. We use the correct form here.
const ALLOWED_UPLOAD_CONTENT_TYPES = new Set([
  "application/postscript",          // .ai, .eps
  "text/csv",                        // .csv
  "application/msword",              // .doc
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
  "image/gif",                       // .gif
  "image/jpeg",                      // .jpeg
  "image/jpg",                       // .jpg
  "application/vnd.oasis.opendocument.spreadsheet", // .ods
  "application/pdf",                 // .pdf
  "image/png",                       // .png
  "text/rtf",                        // .rtf
  "image/tif",                       // .tif
  "text/plain",                      // .txt
  "application/vnd.ms-excel",        // .xls
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
  "text/xml",                        // .xml
]);

// QBO documents a 100 MB per-request cap on /upload. We enforce client-side
// BEFORE allocating Buffer.from(base64) so an unbounded base64 string cannot
// be decoded into memory.
const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

// Approximate decoded size of a base64 string without decoding it. base64
// expands 3 bytes -> 4 chars; subtract padding to get the decoded length.
function approximateDecodedSize(base64: string): number {
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

export interface CreateAttachableInput {
  file_name: string;
  note?: string;
  category?: string;
  content_type?: string;
  base64_content?: string;
  file_path?: string;
  file_url?: string;
  attachable_ref?: {
    entity_ref_type: string;
    entity_ref_value: string;
    include_on_send?: boolean;
  };
}

// The file part of the multipart body: either bytes already in memory
// (base64 path) or a local file streamed from disk (file_path / file_url,
// the latter spooled to a temp file by the fetch helper).
type UploadFileSource = { buffer: Buffer } | { path: string; size: number };

function sanitizeFilename(name: string): string {
  return name.replace(/[\r\n"\\]/g, "_");
}

// Map a status code to a user-safe error message. The raw QBO response body
// can include realm IDs, internal trace identifiers, and other detail that
// should not be returned to an MCP client — the LLM has no business seeing
// internal QBO error envelopes. Raw bodies are still logged server-side for
// operator debugging.
function redactedUploadError(statusCode: number | undefined): string {
  if (!statusCode) return "QBO upload failed: network error";
  if (statusCode === 401 || statusCode === 403) return `QBO upload failed (${statusCode}): authentication or authorization error`;
  if (statusCode === 413) return `QBO upload failed (${statusCode}): payload too large`;
  if (statusCode >= 400 && statusCode < 500) return `QBO upload failed (${statusCode}): client error`;
  if (statusCode >= 500) return `QBO upload failed (${statusCode}): QBO server error`;
  /* istanbul ignore next — defensive: <400 status codes never reach this function */
  return `QBO upload failed (${statusCode}): unexpected status`;
}

// Raw multipart/form-data POST to /v3/company/{realmId}/upload. node-quickbooks
// does not wrap this endpoint, so we construct the request manually.
//
// QBO supports multi-file uploads in a single request, but this handler sends
// exactly one file per request — single-file covers the 99% MCP/LLM case and
// multi-file would require a different input schema. Out of scope here.
async function uploadAttachableFile(
  file: UploadFileSource,
  metadata: Record<string, unknown>,
  accessToken: string,
  realmId: string,
  isSandbox: boolean
): Promise<unknown> {
  const boundary = `----QBOBoundary${Date.now()}`;
  const metadataJson = JSON.stringify(metadata);
  const fileName = sanitizeFilename(metadata.FileName as string);
  const contentType = metadata.ContentType as string;

  const preamble = Buffer.from(
    `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file_metadata_01"\r\n` +
      `Content-Type: application/json\r\n` +
      `\r\n` +
      `${metadataJson}\r\n` +
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file_content_01"; filename="${fileName}"\r\n` +
      `Content-Type: ${contentType}\r\n` +
      `\r\n`
  );
  const closer = Buffer.from(`\r\n--${boundary}--\r\n`);
  // Exact Content-Length lets us stream the file part without chunked
  // transfer encoding, which the QBO endpoint does not reliably accept.
  const fileSize = "buffer" in file ? file.buffer.length : file.size;
  const contentLength = preamble.length + fileSize + closer.length;

  const host = isSandbox
    ? "sandbox-quickbooks.api.intuit.com"
    : "quickbooks.api.intuit.com";
  const requestPath = `/v3/company/${realmId}/upload`;

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: host,
        path: requestPath,
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
          "Content-Length": contentLength,
          Accept: "application/json",
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          const responseText = Buffer.concat(chunks).toString("utf-8");
          if (res.statusCode && res.statusCode >= 400) {
            console.error(`[qbo-attachable-upload] QBO ${res.statusCode}: ${responseText}`);
            reject(new Error(redactedUploadError(res.statusCode)));
            return;
          }
          try {
            resolve(JSON.parse(responseText) as unknown);
          } catch {
            console.error(`[qbo-attachable-upload] QBO ${res.statusCode} non-JSON: ${responseText}`);
            reject(new Error(redactedUploadError(res.statusCode)));
          }
        });
      }
    );
    req.on("error", (err) => {
      console.error(`[qbo-attachable-upload] network error: ${err.message}`);
      reject(new Error(redactedUploadError(undefined)));
    });

    req.write(preamble);
    if ("buffer" in file) {
      req.write(file.buffer);
      req.write(closer);
      req.end();
    } else {
      // Stream the file part from disk — memory stays flat for large files.
      // The read is bounded to the stat'ed size so a file that GROWS between
      // stat and read cannot overrun the declared Content-Length; a file that
      // SHRINKS is caught by the bytesRead check below.
      const readStream = createReadStream(file.path, { end: file.size - 1 });
      /* istanbul ignore next — defensive: fires only on network failure
         mid-stream; prevents the unpiped read stream from leaking its fd. */
      req.on("error", () => readStream.destroy());
      /* istanbul ignore next — defensive: the file was stat'ed moments ago;
         this fires only if it vanishes or the disk errors mid-read. */
      readStream.on("error", (err) => {
        console.error(`[qbo-attachable-upload] file read error: ${err.message}`);
        req.destroy(err);
        reject(new Error(`Failed reading file for upload: ${err.message}`));
      });
      readStream.pipe(req, { end: false });
      readStream.on("end", () => {
        /* istanbul ignore next — defensive: file truncated between stat and
           read; without this check QBO would wait for bytes that never come. */
        if (readStream.bytesRead !== file.size) {
          req.destroy();
          reject(
            new Error(
              `File changed during upload: read ${readStream.bytesRead} of ${file.size} expected bytes.`
            )
          );
          return;
        }
        req.write(closer);
        req.end();
      });
    }
  });
}

export async function createQuickbooksAttachable(
  data: CreateAttachableInput
): Promise<ToolResponse<any>> {
  try {
    // Build payload — same shape whether or not we're uploading binary content.
    const payload: Record<string, unknown> = { FileName: data.file_name };
    if (data.note) payload.Note = data.note;
    if (data.category) payload.Category = data.category;
    if (data.content_type) payload.ContentType = data.content_type;
    if (data.attachable_ref) {
      const entityRef: Record<string, unknown> = {
        EntityRef: {
          type: data.attachable_ref.entity_ref_type,
          value: data.attachable_ref.entity_ref_value,
        },
      };
      if (typeof data.attachable_ref.include_on_send === "boolean") {
        entityRef.IncludeOnSend = data.attachable_ref.include_on_send;
      }
      payload.AttachableRef = [entityRef];
    }

    // ── Binary upload path ────────────────────────────────────────────────
    // Source precedence: file_url / file_path (mutually exclusive) win over
    // base64_content; base64_content alone preserves the original behavior.
    if (data.file_url && data.file_path) {
      return {
        result: null,
        isError: true,
        error: "Provide either file_url or file_path, not both.",
      };
    }

    const hasFileSource = Boolean(data.file_url || data.file_path || data.base64_content);
    if (hasFileSource) {
      // Resolve the file source first (cheap, no auth), then validate type.
      let fileSource: UploadFileSource;
      let fetchedContentType: string | null = null;
      let cleanup: (() => Promise<void>) | null = null;

      if (data.file_url) {
        const fetched = await fetchUrlToTempFile(data.file_url, MAX_UPLOAD_BYTES);
        fileSource = { path: fetched.path, size: fetched.size };
        fetchedContentType = fetched.contentTypeHeader;
        cleanup = fetched.cleanup;
      } else if (data.file_path) {
        const local = await resolveLocalFile(data.file_path, MAX_UPLOAD_BYTES);
        fileSource = { path: local.path, size: local.size };
      } else {
        // base64 path — validate the content type BEFORE decoding, so an
        // unsupported type is rejected without allocating the decoded buffer
        // (same error precedence as the original implementation).
        const preliminaryType =
          data.content_type ?? inferContentType(data.file_name) ?? "application/octet-stream";
        if (!ALLOWED_UPLOAD_CONTENT_TYPES.has(preliminaryType)) {
          return {
            result: null,
            isError: true,
            error: `Unsupported content_type "${preliminaryType}". Allowed: ${[...ALLOWED_UPLOAD_CONTENT_TYPES].sort().join(", ")}`,
          };
        }
        // Enforce size cap BEFORE decoding to a Buffer.
        const approxSize = approximateDecodedSize(data.base64_content!);
        if (approxSize > MAX_UPLOAD_BYTES) {
          return {
            result: null,
            isError: true,
            error: `File too large: approximately ${approxSize} bytes exceeds QBO's ${MAX_UPLOAD_BYTES} byte (100 MB) upload limit.`,
          };
        }
        const fileBuffer = Buffer.from(data.base64_content!, "base64");
        /* istanbul ignore next — defensive: the approxSize check above already
           rejects oversized input; this guards only the malformed-base64 edge
           case where decoded length unexpectedly exceeds the approximation. */
        if (fileBuffer.length > MAX_UPLOAD_BYTES) {
          return {
            result: null,
            isError: true,
            error: `File too large: ${fileBuffer.length} bytes exceeds QBO's ${MAX_UPLOAD_BYTES} byte (100 MB) upload limit.`,
          };
        }
        fileSource = { buffer: fileBuffer };
      }

      try {
        // Content type: explicit override > inferred from file_name /
        // file_path / file_url PATH extension (query strings excluded so
        // '?file=x.pdf' can't spoof the type). The URL's Content-Type header
        // is deliberately not trusted as-is — servers routinely send
        // octet-stream — but a QBO-supported header value (case-insensitive
        // per RFC 2045) is accepted as a last resort.
        const urlPathname = data.file_url ? new URL(data.file_url).pathname : undefined;
        const headerToken = fetchedContentType
          ? fetchedContentType.split(";")[0].trim().toLowerCase()
          : null;
        const effectiveContentType =
          data.content_type ??
          inferContentType(data.file_name, data.file_path, urlPathname) ??
          (headerToken && ALLOWED_UPLOAD_CONTENT_TYPES.has(headerToken) ? headerToken : null) ??
          "application/octet-stream";
        if (!ALLOWED_UPLOAD_CONTENT_TYPES.has(effectiveContentType)) {
          return {
            result: null,
            isError: true,
            error: `Unsupported content_type "${effectiveContentType}". Allowed: ${[...ALLOWED_UPLOAD_CONTENT_TYPES].sort().join(", ")}`,
          };
        }
        payload.ContentType = effectiveContentType;

        const { accessToken, realmId, isSandbox } =
          await QuickbooksClient.getAuthCredentials();
        const uploadResult = await uploadAttachableFile(
          fileSource,
          payload,
          accessToken,
          realmId,
          isSandbox
        );
        return { result: uploadResult, isError: false, error: null };
      } finally {
        if (cleanup) await cleanup();
      }
    }

    // ── Metadata-only path (preserved behavior, post-#41 auth) ────────────
    const quickbooks = await QuickbooksClient.getInstance();
    return new Promise((resolve) => {
      (quickbooks as any).createAttachable(payload, (err: any, created: any) => {
        if (err) resolve({ result: null, isError: true, error: formatError(err) });
        else resolve({ result: created, isError: false, error: null });
      });
    });
  } catch (error) {
    return { result: null, isError: true, error: formatError(error) };
  }
}
