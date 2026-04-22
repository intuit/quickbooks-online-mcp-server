import { QuickbooksClient } from "../clients/quickbooks-client.js";
import { ToolResponse } from "../types/tool-response.js";
import { formatError } from "../helpers/format-error.js";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

/**
 * Download an attachable file from QuickBooks Online
 * @param id The ID of the attachable to download
 * @param outputPath Optional path to save the file (defaults to temp directory)
 */
export async function downloadQuickbooksAttachable(
  id: string,
  outputPath?: string
): Promise<ToolResponse<{ filePath: string; fileName: string }>> {
  try {
    const quickbooks = await QuickbooksClient.getInstance();

    // First get the attachable metadata
    const attachable = await new Promise<any>((resolve, reject) => {
      quickbooks.getAttachable(id, (err: any, result: any) => {
        if (err) reject(err);
        else resolve(result);
      });
    });

    if (!attachable?.TempDownloadUri) {
      return {
        result: null,
        isError: true,
        error: "Attachable has no TempDownloadUri - file may not be available for download",
      };
    }

    const fileName = attachable.FileName || `attachable_${id}`;
    const downloadUrl = attachable.TempDownloadUri;

    // Determine output path
    const finalPath = outputPath || path.join(os.tmpdir(), `qb_${id}_${fileName}`);

    // Download the file
    const response = await fetch(downloadUrl);
    if (!response.ok) {
      return {
        result: null,
        isError: true,
        error: `Failed to download file: ${response.status} ${response.statusText}`,
      };
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(finalPath, buffer);

    return {
      result: {
        filePath: finalPath,
        fileName: fileName,
      },
      isError: false,
      error: null,
    };
  } catch (error) {
    return {
      result: null,
      isError: true,
      error: formatError(error),
    };
  }
}
