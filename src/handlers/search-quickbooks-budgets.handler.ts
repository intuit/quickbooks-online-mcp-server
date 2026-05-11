import { quickbooksClient } from "../clients/quickbooks-client.js";
import { ToolResponse } from "../types/tool-response.js";
import { formatError } from "../helpers/format-error.js";

export interface SearchBudgetsInput {
  name?: string;
  active?: boolean;
  limit?: number;
}

export async function searchQuickbooksBudgets(data: SearchBudgetsInput): Promise<ToolResponse<any>> {
  try {
    await quickbooksClient.authenticate();
    const quickbooks = quickbooksClient.getQuickbooks();
    const criteria: Record<string, any> = {};
    if (data.name) criteria.Name = data.name;
    if (data.active !== undefined) criteria.Active = data.active;
    if (data.limit) criteria.limit = data.limit;

    return new Promise((resolve) => {
      (quickbooks as any).findBudgets(criteria, (err: any, result: any) => {
        if (err) resolve({ result: null, isError: true, error: formatError(err) });
        else resolve({ result: result?.QueryResponse?.Budget || [], isError: false, error: null });
      });
    });
  } catch (error) {
    return { result: null, isError: true, error: formatError(error) };
  }
}
