import { QuickbooksClient } from "../clients/quickbooks-client.js";
import { ToolResponse } from "../types/tool-response.js";
import { formatError } from "../helpers/format-error.js";

export interface UpdateDepositInput {
  id: string;
  sync_token: string;
  private_note?: string;
}

export async function updateQuickbooksDeposit(data: UpdateDepositInput): Promise<ToolResponse<any>> {
  try {
    const quickbooks = await QuickbooksClient.getInstance();

    // QBO rejects a sparse Deposit update that omits DepositToAccountRef (and
    // other required fields) — unlike Purchase, sparse=true isn't honored here.
    // Fetch the current record and send a full object back instead.
    const current: any = await new Promise((resolve, reject) => {
      (quickbooks as any).getDeposit(data.id, (err: any, deposit: any) => {
        if (err) reject(err); else resolve(deposit);
      });
    });

    const payload: any = { ...current, SyncToken: data.sync_token };
    if (data.private_note) payload.PrivateNote = data.private_note;

    return new Promise((resolve) => {
      (quickbooks as any).updateDeposit(payload, (err: any, updated: any) => {
        if (err) resolve({ result: null, isError: true, error: formatError(err) });
        else resolve({ result: updated, isError: false, error: null });
      });
    });
  } catch (error) {
    return { result: null, isError: true, error: formatError(error) };
  }
}

