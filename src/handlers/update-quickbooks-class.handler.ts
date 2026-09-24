import { QuickbooksClient } from "../clients/quickbooks-client.js";
import { ToolResponse } from "../types/tool-response.js";
import { formatError } from "../helpers/format-error.js";
import { mergeForFullUpdate, promisifyGetter } from "../helpers/read-merge-write.js";

export interface UpdateClassInput {
  id: string;
  sync_token: string;
  name?: string;
  active?: boolean;
}

export async function updateQuickbooksClass(data: UpdateClassInput): Promise<ToolResponse<any>> {
  try {
    const quickbooks = await QuickbooksClient.getInstance();
    const payload: any = { Id: data.id, SyncToken: data.sync_token, sparse: true };
    if (data.name) payload.Name = data.name;
    if (data.active !== undefined) payload.Active = data.active;

    // Read-merge-write: QBO sparse updates are unreliable (omitted fields
    // can be nulled; line-bearing sparse updates are rejected). Fetch the
    // current entity, merge changes over it, send a full update.

    const merged = await mergeForFullUpdate(promisifyGetter(quickbooks, "getClass"), payload);

    return new Promise((resolve) => {
      (quickbooks as any).updateClass(merged, (err: any, updated: any) => {
        if (err) resolve({ result: null, isError: true, error: formatError(err) });
        else resolve({ result: updated, isError: false, error: null });
      });
    });
  } catch (error) {
    return { result: null, isError: true, error: formatError(error) };
  }
}

