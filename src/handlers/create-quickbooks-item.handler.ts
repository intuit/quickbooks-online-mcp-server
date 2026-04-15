import { getQuickbooks } from "../clients/quickbooks-client.js";
import { ToolResponse } from "../types/tool-response.js";
import { formatError } from "../helpers/format-error.js";

export interface CreateItemInput {
  name: string;
  type: string; // Service, Inventory, etc.
  income_account_ref: string; // account id
  expense_account_ref?: string;
  unit_price?: number;
  description?: string;
}

export async function createQuickbooksItem(data: CreateItemInput): Promise<ToolResponse<any>> {
  try {
    const quickbooks = await getQuickbooks();

    const payload: any = {
      Name: data.name,
      Type: data.type,
      IncomeAccountRef: { value: data.income_account_ref },
      ExpenseAccountRef: data.expense_account_ref ? { value: data.expense_account_ref } : undefined,
      UnitPrice: data.unit_price,
      Description: data.description,
    };

    return new Promise((resolve) => {
      (quickbooks as any).createItem(payload, (err: any, item: any) => {
        if (err) resolve({ result: null, isError: true, error: formatError(err) });
        else resolve({ result: item, isError: false, error: null });
      });
    });
  } catch (error) {
    return { result: null, isError: true, error: formatError(error) };
  }
} 