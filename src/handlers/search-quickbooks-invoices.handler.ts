import { getQuickbooks } from "../clients/quickbooks-client.js";
import { ToolResponse } from "../types/tool-response.js";
import { formatError } from "../helpers/format-error.js";
import { buildQuickbooksSearchCriteria, QuickbooksSearchCriteriaInput } from "../helpers/build-quickbooks-search-criteria.js";

export type InvoiceSearchCriteria = QuickbooksSearchCriteriaInput;

/**
 * Search for invoices in QuickBooks Online using criteria supported by node-quickbooks findInvoices.
 */
export async function searchQuickbooksInvoices(criteria: InvoiceSearchCriteria): Promise<ToolResponse<any[]>> {
  try {
    const quickbooks = await getQuickbooks();
    const normalizedCriteria = buildQuickbooksSearchCriteria(criteria);

    return new Promise((resolve) => {
      (quickbooks as any).findInvoices(normalizedCriteria, (err: any, invoices: any) => {
        if (err) {
          resolve({ result: null, isError: true, error: formatError(err) });
        } else {
          resolve({
            result: invoices.QueryResponse.Invoice || [],
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