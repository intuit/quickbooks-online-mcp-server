import { getQuickbooks } from "../clients/quickbooks-client.js";
import { ToolResponse } from "../types/tool-response.js";
import { formatError } from "../helpers/format-error.js";

export interface SearchPaymentMethodsInput {
  name?: string;
  active?: boolean;
  type?: string;
  limit?: number;
}

export async function searchQuickbooksPaymentMethods(data: SearchPaymentMethodsInput): Promise<ToolResponse<any>> {
  try {
    const quickbooks = await getQuickbooks();
    const criteria: Record<string, any> = {};
    if (data.name) criteria.Name = data.name;
    if (data.active !== undefined) criteria.Active = data.active;
    if (data.type) criteria.Type = data.type;
    if (data.limit) criteria.limit = data.limit;

    return new Promise((resolve) => {
      (quickbooks as any).findPaymentMethods(criteria, (err: any, result: any) => {
        if (err) resolve({ result: null, isError: true, error: formatError(err) });
        else resolve({ result: result?.QueryResponse?.PaymentMethod || [], isError: false, error: null });
      });
    });
  } catch (error) {
    return { result: null, isError: true, error: formatError(error) };
  }
}
