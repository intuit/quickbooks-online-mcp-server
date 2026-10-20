import { QuickbooksClient } from "../clients/quickbooks-client.js";
import { ToolResponse } from "../types/tool-response.js";
import { formatError } from "../helpers/format-error.js";
import { buildSparsePayload } from "../helpers/sparse-patch.js";

export interface UpdatePurchaseInput {
  purchase_id: string;
  patch: Record<string, any>; // Fields to change; everything else is kept
}

/**
 * Sparse-update a purchase in QuickBooks Online. Fetches the current record only for
 * its SyncToken so callers only send the fields they want to change (a caller-supplied
 * SyncToken in the patch wins over the fetched one).
 */
export async function updateQuickbooksPurchase({ purchase_id, patch }: UpdatePurchaseInput): Promise<ToolResponse<any>> {
  try {
    const quickbooks = await QuickbooksClient.getInstance();

    const existing: any = await new Promise((res, rej) => {
      (quickbooks as any).getPurchase(purchase_id, (e: any, found: any) => (e ? rej(e) : res(found)));
    });

    const updatePayload = buildSparsePayload(purchase_id, existing, patch);

    return new Promise((resolve) => {
      quickbooks.updatePurchase(updatePayload, (err: any, updated: any) => {
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
