import { QuickbooksClient } from "../clients/quickbooks-client.js";
import { ToolResponse } from "../types/tool-response.js";
import { formatError } from "../helpers/format-error.js";
import { mergeForFullUpdate, promisifyGetter } from "../helpers/read-merge-write.js";

export interface UpdateSalesReceiptInput {
  id: string;
  sync_token: string;
  customer_ref?: string;
  private_note?: string;
  doc_number?: string;
}

export async function updateQuickbooksSalesReceipt(data: UpdateSalesReceiptInput): Promise<ToolResponse<any>> {
  try {
    const quickbooks = await QuickbooksClient.getInstance();

    const payload: any = {
      Id: data.id,
      SyncToken: data.sync_token,
      sparse: true,
    };

    if (data.customer_ref) {
      payload.CustomerRef = { value: data.customer_ref };
    }
    if (data.private_note) {
      payload.PrivateNote = data.private_note;
    }
    if (data.doc_number) {
      payload.DocNumber = data.doc_number;
    }

    // Read-merge-write: QBO sparse updates are unreliable (omitted fields
    // can be nulled; line-bearing sparse updates are rejected). Fetch the
    // current entity, merge changes over it, send a full update.

    const merged = await mergeForFullUpdate(promisifyGetter(quickbooks, "getSalesReceipt"), payload);

    return new Promise((resolve) => {
      (quickbooks as any).updateSalesReceipt(merged, (err: any, updated: any) => {
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

