import path from "path";

// Shared MIME-type knowledge for the QBO Attachable /upload endpoint. Used by
// both the create and update attachable handlers so the accepted-type list and
// the extension→type mapping live in exactly one place.
//
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
export const ALLOWED_UPLOAD_CONTENT_TYPES = new Set([
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

// Map a lowercase file extension (including the leading dot) to the QBO-accepted
// MIME type. Lets callers pass a file_path without also specifying content_type.
// Every value here is a member of ALLOWED_UPLOAD_CONTENT_TYPES above. .jpg maps
// to image/jpeg (the RFC-standard form; QBO also accepts image/jpg) and .tiff is
// included alongside .tif for convenience.
export const EXTENSION_TO_CONTENT_TYPE: Record<string, string> = {
  ".ai": "application/postscript",
  ".eps": "application/postscript",
  ".csv": "text/csv",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".ods": "application/vnd.oasis.opendocument.spreadsheet",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".rtf": "text/rtf",
  ".tif": "image/tif",
  ".tiff": "image/tif",
  ".txt": "text/plain",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".xml": "text/xml",
};

// Comma-separated, sorted list of accepted content types — for error messages.
export function allowedContentTypesList(): string {
  return [...ALLOWED_UPLOAD_CONTENT_TYPES].sort().join(", ");
}

// Infer a QBO-accepted content type from a file name or path's extension.
// Returns undefined when the extension is absent or not recognized. Uses
// path.extname so a dot in a parent directory name (e.g. "/a.b/file") does not
// get mistaken for the file's extension, and dotfiles (".env") yield "".
export function inferContentTypeFromExtension(fileNameOrPath: string): string | undefined {
  const ext = path.extname(fileNameOrPath).toLowerCase();
  if (!ext) return undefined;
  return EXTENSION_TO_CONTENT_TYPE[ext];
}
