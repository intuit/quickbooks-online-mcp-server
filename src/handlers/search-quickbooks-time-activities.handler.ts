import { getQuickbooks } from "../clients/quickbooks-client.js";
import { ToolResponse } from "../types/tool-response.js";
import { formatError } from "../helpers/format-error.js";

export interface SearchTimeActivitiesInput {
  employee_ref?: string;
  vendor_ref?: string;
  customer_ref?: string;
  txn_date_from?: string;
  txn_date_to?: string;
  limit?: number;
}

export async function searchQuickbooksTimeActivities(data: SearchTimeActivitiesInput): Promise<ToolResponse<any>> {
  try {
    const quickbooks = await getQuickbooks();
    const criteria: Record<string, any> = {};
    if (data.employee_ref) criteria.EmployeeRef = data.employee_ref;
    if (data.vendor_ref) criteria.VendorRef = data.vendor_ref;
    if (data.customer_ref) criteria.CustomerRef = data.customer_ref;
    if (data.txn_date_from) criteria.TxnDate = { $gte: data.txn_date_from };
    if (data.txn_date_to) criteria.TxnDate = { ...criteria.TxnDate, $lte: data.txn_date_to };
    if (data.limit) criteria.limit = data.limit;

    return new Promise((resolve) => {
      (quickbooks as any).findTimeActivities(criteria, (err: any, result: any) => {
        if (err) resolve({ result: null, isError: true, error: formatError(err) });
        else resolve({ result: result?.QueryResponse?.TimeActivity || [], isError: false, error: null });
      });
    });
  } catch (error) {
    return { result: null, isError: true, error: formatError(error) };
  }
}
