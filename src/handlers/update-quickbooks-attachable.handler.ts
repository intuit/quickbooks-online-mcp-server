import { getQuickbooks } from "../clients/quickbooks-client.js";
import { ToolResponse } from "../types/tool-response.js";
import { formatError } from "../helpers/format-error.js";

export interface UpdateAttachableInput {
  id: string;
  sync_token: string;
  file_name?: string;
  note?: string;
  category?: string;
}

export async function updateQuickbooksAttachable(data: UpdateAttachableInput): Promise<ToolResponse<any>> {
  try {
    const quickbooks = await getQuickbooks();
    const payload: any = { Id: data.id, SyncToken: data.sync_token, sparse: true };
    if (data.file_name) payload.FileName = data.file_name;
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
