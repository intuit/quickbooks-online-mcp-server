import { quickbooksClient } from "../clients/quickbooks-client.js";
import { ToolResponse } from "../types/tool-response.js";
import { formatError } from "../helpers/format-error.js";
import * as fs from "fs";
import * as path from "path";

// Common MIME types by extension
const MIME_TYPES: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".csv": "text/csv",
  ".txt": "text/plain",
};

/**
 * Upload a file as an attachable to QuickBooks Online
 * @param filePath Local path to the file to upload
 * @param entityType Optional entity type to link to (e.g., 'Bill', 'Purchase', 'Invoice')
 * @param entityId Optional entity ID to link to
 */
export async function uploadQuickbooksAttachable(
  filePath: string,
  entityType?: string,
  entityId?: string
): Promise<ToolResponse<any>> {
  try {
    // Verify file exists
    if (!fs.existsSync(filePath)) {
      return {
        result: null,
        isError: true,
        error: `File not found: ${filePath}`,
      };
    }

    await quickbooksClient.authenticate();
    const quickbooks = quickbooksClient.getQuickbooks();

    const fileName = path.basename(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";

    // Create a readable stream
    const stream = fs.createReadStream(filePath);

    return new Promise((resolve) => {
      quickbooks.upload(
        fileName,
        contentType,
        stream,
        entityType || null,
        entityId || null,
        (err: any, attachable: any) => {
          if (err) {
            resolve({
              result: null,
              isError: true,
              error: formatError(err),
            });
          } else {
            resolve({
              result: attachable,
              isError: false,
              error: null,
            });
          }
        }
      );
    });
  } catch (error) {
    return {
      result: null,
      isError: true,
      error: formatError(error),
    };
  }
}
