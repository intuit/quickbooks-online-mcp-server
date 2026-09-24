import { QuickbooksClient } from "../clients/quickbooks-client.js";
import { ToolResponse } from "../types/tool-response.js";
import { formatError } from "../helpers/format-error.js";
import { mergeForFullUpdate, promisifyGetter } from "../helpers/read-merge-write.js";

export interface UpdateInvoiceInput {
  invoice_id: string;
  patch: Record<string, any>; // Sparse update fields per Quickbooks spec
}

export async function updateQuickbooksInvoice({ invoice_id, patch }: UpdateInvoiceInput): Promise<ToolResponse<any>> {
  try {
    const quickbooks = await QuickbooksClient.getInstance();

    // Need SyncToken; fetch existing invoice first
    const existing: any = await new Promise((res, rej) => {
      (quickbooks as any).getInvoice(invoice_id, (e: any, inv: any) => (e ? rej(e) : res(inv)));
    });

    const updatePayload = { ...existing, ...patch, Id: invoice_id, sparse: true };

    // Read-merge-write: QBO sparse updates are unreliable (omitted fields
    // can be nulled; line-bearing sparse updates are rejected). Fetch the
    // current entity, merge changes over it, send a full update.

    const merged = await mergeForFullUpdate(promisifyGetter(quickbooks, "getInvoice"), updatePayload);

    return new Promise((resolve) => {
      (quickbooks as any).updateInvoice(merged, (err: any, updated: any) => {
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
