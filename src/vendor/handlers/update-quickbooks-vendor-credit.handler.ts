import { QuickbooksClient } from "../clients/quickbooks-client.js";
import { ToolResponse } from "../types/tool-response.js";
import { formatError } from "../helpers/format-error.js";
import {
  buildVendorCreditLine,
  GlobalTaxCalculation,
  VendorCreditLineItemInput,
} from "./create-quickbooks-vendor-credit.handler.js";

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

    let payload: any;
    if (data.line_items) {
      // Replacing lines requires a FULL update: QBO rejects sparse updates
      // that carry a Line array ("Required parameter VendorRef is missing",
      // error 2020). Read the current entity and merge so every field the
      // caller didn't override is preserved, then let QBO recompute
      // TxnTaxDetail from the new lines' tax codes.
      const existing: any = await new Promise((resolve, reject) => {
        (quickbooks as any).getVendorCredit(data.id, (err: any, found: any) =>
          err ? reject(err) : resolve(found)
        );
      });
      const {
        TxnTaxDetail: _txnTax, // recomputed by QBO from the new lines
        TotalAmt: _totalAmt, // derived — recomputed by QBO
        Balance: _balance, // derived — recomputed by QBO
        MetaData: _metaData, // read-only
        ...base
      } = existing;
      payload = {
        ...base,
        Id: data.id,
        SyncToken: data.sync_token,
        sparse: false,
        Line: data.line_items.map(buildVendorCreditLine),
      };
    } else {
      payload = { Id: data.id, SyncToken: data.sync_token, sparse: true };
    }

    if (data.vendor_ref) payload.VendorRef = { value: data.vendor_ref };
    if (data.private_note) payload.PrivateNote = data.private_note;
    if (data.global_tax_calculation) payload.GlobalTaxCalculation = data.global_tax_calculation;

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
