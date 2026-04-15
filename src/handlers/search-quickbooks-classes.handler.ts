import { getQuickbooks } from "../clients/quickbooks-client.js";
import { ToolResponse } from "../types/tool-response.js";
import { formatError } from "../helpers/format-error.js";

export interface SearchClassesInput {
  name?: string;
  active?: boolean;
  limit?: number;
}

export async function searchQuickbooksClasses(data: SearchClassesInput): Promise<ToolResponse<any>> {
  try {
    const quickbooks = await getQuickbooks();
    const criteria: Record<string, any> = {};
    if (data.name) criteria.Name = data.name;
    if (data.active !== undefined) criteria.Active = data.active;
    if (data.limit) criteria.limit = data.limit;

    return new Promise((resolve) => {
      (quickbooks as any).findClasses(criteria, (err: any, result: any) => {
        if (err) resolve({ result: null, isError: true, error: formatError(err) });
        else resolve({ result: result?.QueryResponse?.Class || [], isError: false, error: null });
      });
    });
  } catch (error) {
    return { result: null, isError: true, error: formatError(error) };
  }
}
