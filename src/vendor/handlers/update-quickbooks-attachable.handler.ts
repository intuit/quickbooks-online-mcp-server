import path from "path";
import { QuickbooksClient } from "../clients/quickbooks-client.js";
import { ToolResponse } from "../types/tool-response.js";
import { formatError } from "../helpers/format-error.js";
import { inferContentType } from "../helpers/attachable-file-source.js";

export interface UpdateAttachableInput {
  id: string;
  sync_token: string;
  file_name?: string;
  content_type?: string;
  note?: string;
  category?: string;
  file_path?: string;
}

export async function updateQuickbooksAttachable(data: UpdateAttachableInput): Promise<ToolResponse<any>> {
  try {
    // QBO's Attachable update is metadata-only — it cannot replace the stored
    // file bytes. file_path here is a convenience that only derives the
    // FileName/ContentType metadata from the path (no disk read, no re-upload).
    // To attach a different/corrected file, create a new attachable
    // (create_attachable with file_path) and delete the old one.
    let fileName = data.file_name;
    let contentType = data.content_type;
    if (data.file_path) {
      if (!fileName) fileName = path.basename(data.file_path);
      if (!contentType) contentType = inferContentType(data.file_path) ?? undefined;
    }

    const quickbooks = await QuickbooksClient.getInstance();
    const payload: any = { Id: data.id, SyncToken: data.sync_token, sparse: true };
    if (fileName) payload.FileName = fileName;
    if (contentType) payload.ContentType = contentType;
    if (data.note) payload.Note = data.note;
    if (data.category) payload.Category = data.category;

    return new Promise((resolve) => {
      (quickbooks as any).updateAttachable(payload, (err: any, updated: any) => {
        if (err) resolve({ result: null, isError: true, error: formatError(err) });
        else resolve({ result: updated, isError: false, error: null });
      });
    });
  } catch (error) {
    return { result: null, isError: true, error: formatError(error) };
  }
}

