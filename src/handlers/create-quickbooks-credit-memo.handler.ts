import { QuickbooksClient } from "../clients/quickbooks-client.js";
import { ToolResponse } from "../types/tool-response.js";
import { formatError } from "../helpers/format-error.js";
import {
  applySalesCreateClassRefWarning,
  formatSalesCreateError,
  validateLineClassRefs,
} from "../helpers/sales-line-class-ref.js";

export interface CreateCreditMemoInput {
  customer_ref: string;
  line_items: Array<{
    item_ref: string;
    qty: number;
    unit_price: number;
    description?: string;
    tax_code_ref?: string; // TaxCode id (non-US) or TAX/NON (US)
    class_ref?: string; // Class id for per-line class tracking
  }>;
  txn_date?: string;
  doc_number?: string;
  private_note?: string;
  global_tax_calculation?: "TaxExcluded" | "TaxInclusive" | "NotApplicable";
}

export async function createQuickbooksCreditMemo(data: CreateCreditMemoInput): Promise<ToolResponse<any>> {
  try {
    const classRefError = validateLineClassRefs(data.line_items);
    if (classRefError) {
      return { result: null, isError: true, error: classRefError };
    }

    const quickbooks = await QuickbooksClient.getInstance();

    const creditMemoPayload: any = {
      CustomerRef: { value: data.customer_ref },
      Line: data.line_items.map((l, idx) => ({
        Id: `${idx + 1}`,
        LineNum: idx + 1,
        Description: l.description || undefined,
        Amount: l.qty * l.unit_price,
        DetailType: "SalesItemLineDetail",
        SalesItemLineDetail: {
          ItemRef: { value: l.item_ref },
          Qty: l.qty,
          UnitPrice: l.unit_price,
          TaxCodeRef: l.tax_code_ref ? { value: l.tax_code_ref } : undefined,
          ClassRef: l.class_ref ? { value: l.class_ref } : undefined,
        },
      })),
    };

    if (data.txn_date) {
      creditMemoPayload.TxnDate = data.txn_date;
    }
    if (data.doc_number) {
      creditMemoPayload.DocNumber = data.doc_number;
    }
    if (data.private_note) {
      creditMemoPayload.PrivateNote = data.private_note;
    }
    if (data.global_tax_calculation) {
      creditMemoPayload.GlobalTaxCalculation = data.global_tax_calculation;
    }

    return new Promise((resolve) => {
      (quickbooks as any).createCreditMemo(creditMemoPayload, async (err: any, created: any) => {
        if (err) {
          resolve({
            result: null,
            isError: true,
            error: await formatSalesCreateError(quickbooks, err, data.line_items),
          });
        } else {
          resolve({
            result: await applySalesCreateClassRefWarning(quickbooks, data.line_items, created),
            isError: false,
            error: null,
          });
        }
      });
    });
  } catch (error) {
    return { result: null, isError: true, error: formatError(error) };
  }
}

