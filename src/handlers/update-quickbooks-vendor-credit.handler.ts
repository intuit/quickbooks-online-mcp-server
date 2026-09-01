import { QuickbooksClient } from "../clients/quickbooks-client.js";
import { ToolResponse } from "../types/tool-response.js";
import { formatError } from "../helpers/format-error.js";
import {
  buildVendorCreditLine,
  GlobalTaxCalculation,
  VendorCreditLineItemInput,
} from "./create-quickbooks-vendor-credit.handler.js";
import { mergeForFullUpdate, promisifyGetter } from "../helpers/read-merge-write.js";

export interface UpdateVendorCreditInput {
  id: string;
  sync_token: string;
  vendor_ref?: string;
  private_note?: string;
  line_items?: VendorCreditLineItemInput[];
  global_tax_calculation?: GlobalTaxCalculation;
}

export async function updateQuickbooksVendorCredit(data: UpdateVendorCreditInput): Promise<ToolResponse<any>> {
  try {
    const quickbooks = await QuickbooksClient.getInstance();

    // Read-merge-write for EVERY update (line-replacing or not): QBO rejects
    // sparse updates that carry a Line array (error 2020), and sparse
    // semantics proved unreliable for other fields too. Fetch the current
    // entity, merge changes over it, send a full payload; QBO recomputes
    // TxnTaxDetail from the merged lines' tax codes.
    const changes: any = { Id: data.id, SyncToken: data.sync_token };
    if (data.line_items) changes.Line = data.line_items.map(buildVendorCreditLine);
    if (data.vendor_ref) changes.VendorRef = { value: data.vendor_ref };
    if (data.private_note) changes.PrivateNote = data.private_note;
    if (data.global_tax_calculation) changes.GlobalTaxCalculation = data.global_tax_calculation;
    const payload = await mergeForFullUpdate(promisifyGetter(quickbooks, "getVendorCredit"), changes);

    return new Promise((resolve) => {
      (quickbooks as any).updateVendorCredit(payload, (err: any, updated: any) => {
        if (err) resolve({ result: null, isError: true, error: formatError(err) });
        else resolve({ result: updated, isError: false, error: null });
      });
    });
  } catch (error) {
    return { result: null, isError: true, error: formatError(error) };
  }
}
