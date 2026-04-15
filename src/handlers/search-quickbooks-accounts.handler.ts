import { getQuickbooks } from "../clients/quickbooks-client.js";
import { ToolResponse } from "../types/tool-response.js";
import { formatError } from "../helpers/format-error.js";
import { buildQuickbooksSearchCriteria, QuickbooksSearchCriteriaInput } from "../helpers/build-quickbooks-search-criteria.js";

export type AccountSearchCriteria = QuickbooksSearchCriteriaInput;

export async function searchQuickbooksAccounts(criteria: AccountSearchCriteria): Promise<ToolResponse<any[]>> {
  try {
    const quickbooks = await getQuickbooks();

    const normalizedCriteria = buildQuickbooksSearchCriteria(criteria);

    return new Promise((resolve) => {
      (quickbooks as any).findAccounts(normalizedCriteria, (err: any, accounts: any) => {
        if (err) {
          resolve({ result: null, isError: true, error: formatError(err) });
        } else {
          resolve({ result: accounts.QueryResponse.Account || [], isError: false, error: null });
        }
      });
    });
  } catch (error) {
    return { result: null, isError: true, error: formatError(error) };
  }
} 