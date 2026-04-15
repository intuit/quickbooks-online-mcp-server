import { getQuickbooks } from "../clients/quickbooks-client.js";
import { ToolResponse } from "../types/tool-response.js";
import { formatError } from "../helpers/format-error.js";

export interface UpdatePurchaseOrderInput {
  id: string;
  sync_token: string;
  vendor_ref?: string;
  private_note?: string;
  doc_number?: string;
}

export async function updateQuickbooksPurchaseOrder(data: UpdatePurchaseOrderInput): Promise<ToolResponse<any>> {
  try {
    const quickbooks = await getQuickbooks();

    const payload: any = {
      Id: data.id,
      SyncToken: data.sync_token,
      sparse: true,
    };

    if (data.vendor_ref) payload.VendorRef = { value: data.vendor_ref };
    if (data.private_note) payload.PrivateNote = data.private_note;
    if (data.doc_number) payload.DocNumber = data.doc_number;

    return new Promise((resolve) => {
      (quickbooks as any).updatePurchaseOrder(payload, (err: any, updated: any) => {
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
