import { getQuickbooks } from "../clients/quickbooks-client.js";
import { ToolResponse } from "../types/tool-response.js";
import { formatError } from "../helpers/format-error.js";

export interface CreateTransferInput {
  from_account_ref: string;
  to_account_ref: string;
  amount: number;
  txn_date?: string;
  private_note?: string;
}

export async function createQuickbooksTransfer(data: CreateTransferInput): Promise<ToolResponse<any>> {
  try {
    const quickbooks = await getQuickbooks();

    const payload: any = {
      FromAccountRef: { value: data.from_account_ref },
      ToAccountRef: { value: data.to_account_ref },
      Amount: data.amount,
    };

    if (data.txn_date) payload.TxnDate = data.txn_date;
    if (data.private_note) payload.PrivateNote = data.private_note;

    return new Promise((resolve) => {
      (quickbooks as any).createTransfer(payload, (err: any, created: any) => {
        if (err) resolve({ result: null, isError: true, error: formatError(err) });
        else resolve({ result: created, isError: false, error: null });
      });
    });
  } catch (error) {
    return { result: null, isError: true, error: formatError(error) };
  }
}
