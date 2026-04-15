import { getQuickbooks } from "../clients/quickbooks-client.js";
import { ToolResponse } from "../types/tool-response.js";
import { formatError } from "../helpers/format-error.js";

export interface SearchVendorCreditsInput {
  vendor_ref?: string;
  limit?: number;
}

export async function searchQuickbooksVendorCredits(data: SearchVendorCreditsInput): Promise<ToolResponse<any>> {
  try {
    const quickbooks = await getQuickbooks();
    const criteria: Record<string, any> = {};
    if (data.vendor_ref) criteria.VendorRef = data.vendor_ref;
    if (data.limit) criteria.limit = data.limit;

    return new Promise((resolve) => {
      (quickbooks as any).findVendorCredits(criteria, (err: any, result: any) => {
        if (err) resolve({ result: null, isError: true, error: formatError(err) });
        else resolve({ result: result?.QueryResponse?.VendorCredit || [], isError: false, error: null });
      });
    });
  } catch (error) {
    return { result: null, isError: true, error: formatError(error) };
  }
}
