import { getQuickbooks } from "../clients/quickbooks-client.js";
import { ToolResponse } from "../types/tool-response.js";
import { formatError } from "../helpers/format-error.js";

export interface UpdateTransferInput {
  id: string;
  sync_token: string;
  from_account_ref?: string;
  to_account_ref?: string;
  amount?: number;
  private_note?: string;
}

export async function updateQuickbooksTransfer(data: UpdateTransferInput): Promise<ToolResponse<any>> {
  try {
    const quickbooks = await getQuickbooks();
    const payload: any = { Id: data.id, SyncToken: data.sync_token, sparse: true };
    if (data.from_account_ref) payload.FromAccountRef = { value: data.from_account_ref };
    if (data.to_account_ref) payload.ToAccountRef = { value: data.to_account_ref };
    if (data.amount !== undefined) payload.Amount = data.amount;
    if (data.private_note) payload.PrivateNote = data.private_note;

    return new Promise((resolve) => {
      (quickbooks as any).updateTransfer(payload, (err: any, updated: any) => {
        if (err) resolve({ result: null, isError: true, error: formatError(err) });
        else resolve({ result: updated, isError: false, error: null });
      });
    });
  } catch (error) {
    return { result: null, isError: true, error: formatError(error) };
  }
}
