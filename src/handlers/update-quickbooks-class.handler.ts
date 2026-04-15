import { getQuickbooks } from "../clients/quickbooks-client.js";
import { ToolResponse } from "../types/tool-response.js";
import { formatError } from "../helpers/format-error.js";

export interface UpdateClassInput {
  id: string;
  sync_token: string;
  name?: string;
  active?: boolean;
}

export async function updateQuickbooksClass(data: UpdateClassInput): Promise<ToolResponse<any>> {
  try {
    const quickbooks = await getQuickbooks();
    const payload: any = { Id: data.id, SyncToken: data.sync_token, sparse: true };
    if (data.name) payload.Name = data.name;
    if (data.active !== undefined) payload.Active = data.active;

    return new Promise((resolve) => {
      (quickbooks as any).updateClass(payload, (err: any, updated: any) => {
        if (err) resolve({ result: null, isError: true, error: formatError(err) });
        else resolve({ result: updated, isError: false, error: null });
      });
    });
  } catch (error) {
    return { result: null, isError: true, error: formatError(error) };
  }
}
