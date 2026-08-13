import { QuickbooksClient } from "../clients/quickbooks-client.js";
import { ToolResponse } from "../types/tool-response.js";
import { formatError } from "../helpers/format-error.js";

export type BillableStatus = "Billable" | "NotBillable" | "HasBeenBilled";

export interface VendorCreditLineItemInput {
  amount: number;
  description?: string;
  account_ref?: string;
  class_ref?: string;
  tax_code_ref?: string;
  billable_status?: BillableStatus;
  customer_ref?: string;
}

export type GlobalTaxCalculation = "TaxExcluded" | "TaxInclusive" | "NotApplicable";

export interface CreateVendorCreditInput {
  vendor_ref: string;
  line_items: VendorCreditLineItemInput[];
  txn_date?: string;
  doc_number?: string;
  private_note?: string;
  global_tax_calculation?: GlobalTaxCalculation;
}

// Build a QBO VendorCredit line the same way bill lines are shaped:
// Line[].AccountBasedExpenseLineDetail carrying AccountRef, ClassRef,
// TaxCodeRef, BillableStatus, and CustomerRef. With per-line TaxCodeRef and a
// top-level GlobalTaxCalculation, QBO auto-calculates TxnTaxDetail — we never
// hardcode a tax code. Shared with the update handler for full-line replacement.
export function buildVendorCreditLine(l: VendorCreditLineItemInput, idx: number) {
  const detail: Record<string, unknown> = {};
  if (l.account_ref) detail.AccountRef = { value: l.account_ref };
  if (l.class_ref) detail.ClassRef = { value: l.class_ref };
  if (l.tax_code_ref) detail.TaxCodeRef = { value: l.tax_code_ref };
  if (l.billable_status) detail.BillableStatus = l.billable_status;
  if (l.customer_ref) detail.CustomerRef = { value: l.customer_ref };
  return {
    Id: `${idx + 1}`,
    Amount: l.amount,
    Description: l.description,
    DetailType: "AccountBasedExpenseLineDetail",
    AccountBasedExpenseLineDetail: detail,
  };
}

export async function createQuickbooksVendorCredit(data: CreateVendorCreditInput): Promise<ToolResponse<any>> {
  try {
    const quickbooks = await QuickbooksClient.getInstance();

    const payload: any = {
      VendorRef: { value: data.vendor_ref },
      Line: data.line_items.map(buildVendorCreditLine),
    };

    if (data.txn_date) payload.TxnDate = data.txn_date;
    if (data.doc_number) payload.DocNumber = data.doc_number;
    if (data.private_note) payload.PrivateNote = data.private_note;
    if (data.global_tax_calculation) payload.GlobalTaxCalculation = data.global_tax_calculation;

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
