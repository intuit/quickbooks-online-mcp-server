import { getQuickbooks } from "../clients/quickbooks-client.js";
import { ToolResponse } from "../types/tool-response.js";
import { formatError } from "../helpers/format-error.js";

export interface SearchTaxAgenciesInput {
  name?: string;
  limit?: number;
}

export async function searchQuickbooksTaxAgencies(data: SearchTaxAgenciesInput): Promise<ToolResponse<any>> {
  try {
    const quickbooks = await getQuickbooks();
    const criteria: Record<string, any> = {};
    if (data.name) criteria.DisplayName = data.name;
    if (data.limit) criteria.limit = data.limit;

    return new Promise((resolve) => {
      (quickbooks as any).findTaxAgencies(criteria, (err: any, result: any) => {
        if (err) resolve({ result: null, isError: true, error: formatError(err) });
        else resolve({ result: result?.QueryResponse?.TaxAgency || [], isError: false, error: null });
      });
    });
  } catch (error) {
    return { result: null, isError: true, error: formatError(error) };
  }
}
