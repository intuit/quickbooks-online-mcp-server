import { QuickbooksClient } from "../clients/quickbooks-client.js";
import { ToolResponse } from "../types/tool-response.js";
import { formatError } from "../helpers/format-error.js";

export interface UpdateBillPaymentInput {
  bill_payment_id: string;
  patch: Record<string, any>; // Fields to change; everything else is kept
}

/**
 * Sparse-update a bill payment in QuickBooks Online. Fetches the current record so
 * callers only send the fields they want to change (a caller-supplied
 * SyncToken in the patch wins over the fetched one).
 */
export async function updateQuickbooksBillPayment({ bill_payment_id, patch }: UpdateBillPaymentInput): Promise<ToolResponse<any>> {
  try {
    const quickbooks = await QuickbooksClient.getInstance();

    const existing: any = await new Promise((res, rej) => {
      (quickbooks as any).getBillPayment(bill_payment_id, (e: any, found: any) => (e ? rej(e) : res(found)));
    });

    const updatePayload = { ...existing, ...patch, Id: bill_payment_id, sparse: true };

    return new Promise((resolve) => {
      quickbooks.updateBillPayment(updatePayload, (err: any, updated: any) => {
        if (err) {
          resolve({ result: null, isError: true, error: formatError(err) });
        } else {
          resolve({ result: updated, isError: false, error: null });
        }
      });
    });
  } catch (error) {
    return { result: null, isError: true, error: formatError(error) };
  }
}
