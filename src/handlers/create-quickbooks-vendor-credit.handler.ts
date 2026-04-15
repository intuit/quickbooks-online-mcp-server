import { getQuickbooks } from "../clients/quickbooks-client.js";
import { ToolResponse } from "../types/tool-response.js";
import { formatError } from "../helpers/format-error.js";

export interface CreateVendorCreditInput {
  vendor_ref: string;
  line_items: Array<{
    amount: number;
    description?: string;
    account_ref?: string;
  }>;
  txn_date?: string;
  doc_number?: string;
  private_note?: string;
}

export async function createQuickbooksVendorCredit(data: CreateVendorCreditInput): Promise<ToolResponse<any>> {
  try {
    const quickbooks = await getQuickbooks();

    const payload: any = {
      VendorRef: { value: data.vendor_ref },
      Line: data.line_items.map((l, idx) => ({
        Id: `${idx + 1}`,
        Amount: l.amount,
        Description: l.description,
        DetailType: "AccountBasedExpenseLineDetail",
        AccountBasedExpenseLineDetail: l.account_ref ? { AccountRef: { value: l.account_ref } } : {},
      })),
    };

    if (data.txn_date) payload.TxnDate = data.txn_date;
    if (data.doc_number) payload.DocNumber = data.doc_number;
    if (data.private_note) payload.PrivateNote = data.private_note;

    return new Promise((resolve) => {
      (quickbooks as any).createVendorCredit(payload, (err: any, created: any) => {
        if (err) resolve({ result: null, isError: true, error: formatError(err) });
        else resolve({ result: created, isError: false, error: null });
      });
    });
  } catch (error) {
    return { result: null, isError: true, error: formatError(error) };
  }
}
