import { getQuickbooks } from "../clients/quickbooks-client.js";
import { ToolResponse } from "../types/tool-response.js";
import { formatError } from "../helpers/format-error.js";

export interface DeleteAttachableInput {
  id: string;
  sync_token: string;
}

export async function deleteQuickbooksAttachable(data: DeleteAttachableInput): Promise<ToolResponse<any>> {
  try {
    const quickbooks = await getQuickbooks();
    const payload = { Id: data.id, SyncToken: data.sync_token };

    return new Promise((resolve) => {
      (quickbooks as any).deleteAttachable(payload, (err: any, result: any) => {
        if (err) resolve({ result: null, isError: true, error: formatError(err) });
        else resolve({ result: result, isError: false, error: null });
      });
    });
  } catch (error) {
    return { result: null, isError: true, error: formatError(error) };
  }
}
