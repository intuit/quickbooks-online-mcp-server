import { QuickbooksClient } from "../clients/quickbooks-client.js";
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
    const quickbooks = await QuickbooksClient.getInstance();
    const payload: any = { Id: data.id, SyncToken: data.sync_token, sparse: true };
    if (data.from_account_ref) payload.FromAccountRef = { value: data.from_account_ref };
    if (data.to_account_ref) payload.ToAccountRef = { value: data.to_account_ref };
    if (data.amount !== undefined) payload.Amount = data.amount;
    if (data.private_note) payload.PrivateNote = data.private_note;

    // QBO requires FromAccountRef, ToAccountRef and Amount on every Transfer update, sparse or not
    // (error 2020 otherwise). Fill in whatever the caller left out from the current transfer.
    if (!payload.FromAccountRef || !payload.ToAccountRef || payload.Amount === undefined) {
      const current = await new Promise<any>((resolve, reject) => {
        (quickbooks as any).getTransfer(data.id, (err: any, t: any) => (err ? reject(err) : resolve(t)));
      });
      payload.FromAccountRef ??= { value: current.FromAccountRef.value };
      payload.ToAccountRef ??= { value: current.ToAccountRef.value };
      payload.Amount ??= current.Amount;
    }

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

