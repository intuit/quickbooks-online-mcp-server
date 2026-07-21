import { QuickbooksClient } from "../clients/quickbooks-client.js";
import { ToolResponse } from "../types/tool-response.js";
import { formatError } from "../helpers/format-error.js";
import { mergeForFullUpdate, promisifyGetter } from "../helpers/read-merge-write.js";

export interface UpdatePaymentInput {
  id: string;
  sync_token: string;
  customer_ref?: string;
  total_amt?: number;
  payment_method_ref?: string;
  private_note?: string;
  deposit_to_account_ref?: string;
}

export async function updateQuickbooksPayment(data: UpdatePaymentInput): Promise<ToolResponse<any>> {
  try {
    const quickbooks = await QuickbooksClient.getInstance();

    const paymentPayload: any = {
      Id: data.id,
      SyncToken: data.sync_token,
      sparse: true,
    };

    if (data.customer_ref) {
      paymentPayload.CustomerRef = { value: data.customer_ref };
    }
    if (data.total_amt !== undefined) {
      paymentPayload.TotalAmt = data.total_amt;
    }
    if (data.payment_method_ref) {
      paymentPayload.PaymentMethodRef = { value: data.payment_method_ref };
    }
    if (data.private_note) {
      paymentPayload.PrivateNote = data.private_note;
    }
    // Payment.DepositToAccountRef is writable — previously accepted by the
    // tool but silently dropped here (defect #8).
    if (data.deposit_to_account_ref) {
      paymentPayload.DepositToAccountRef = { value: data.deposit_to_account_ref };
    }

    // Read-merge-write: QBO sparse updates are unreliable (omitted fields
    // can be nulled; line-bearing sparse updates are rejected). Fetch the
    // current entity, merge changes over it, send a full update.

    const merged = await mergeForFullUpdate(promisifyGetter(quickbooks, "getPayment"), paymentPayload);

    return new Promise((resolve) => {
      (quickbooks as any).updatePayment(merged, (err: any, updated: any) => {
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

