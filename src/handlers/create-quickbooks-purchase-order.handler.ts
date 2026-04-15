import { getQuickbooks } from "../clients/quickbooks-client.js";
import { ToolResponse } from "../types/tool-response.js";
import { formatError } from "../helpers/format-error.js";

export interface CreatePurchaseOrderInput {
  vendor_ref: string;
  line_items: Array<{
    item_ref: string;
    qty: number;
    unit_price: number;
    description?: string;
  }>;
  txn_date?: string;
  doc_number?: string;
  private_note?: string;
  ship_addr?: {
    line1?: string;
    city?: string;
    country_sub_division_code?: string;
    postal_code?: string;
  };
}

export async function createQuickbooksPurchaseOrder(data: CreatePurchaseOrderInput): Promise<ToolResponse<any>> {
  try {
    const quickbooks = await getQuickbooks();

    const payload: any = {
      VendorRef: { value: data.vendor_ref },
      Line: data.line_items.map((l, idx) => ({
        Id: `${idx + 1}`,
        LineNum: idx + 1,
        Description: l.description || undefined,
        Amount: l.qty * l.unit_price,
        DetailType: "ItemBasedExpenseLineDetail",
        ItemBasedExpenseLineDetail: {
          ItemRef: { value: l.item_ref },
          Qty: l.qty,
          UnitPrice: l.unit_price,
        },
      })),
    };

    if (data.txn_date) payload.TxnDate = data.txn_date;
    if (data.doc_number) payload.DocNumber = data.doc_number;
    if (data.private_note) payload.PrivateNote = data.private_note;
    if (data.ship_addr) {
      payload.ShipAddr = {
        Line1: data.ship_addr.line1,
        City: data.ship_addr.city,
        CountrySubDivisionCode: data.ship_addr.country_sub_division_code,
        PostalCode: data.ship_addr.postal_code,
      };
    }

    return new Promise((resolve) => {
      (quickbooks as any).createPurchaseOrder(payload, (err: any, created: any) => {
        if (err) {
          resolve({ result: null, isError: true, error: formatError(err) });
        } else {
          resolve({ result: created, isError: false, error: null });
        }
      });
    });
  } catch (error) {
    return { result: null, isError: true, error: formatError(error) };
  }
}
