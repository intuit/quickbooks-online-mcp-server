import { getQuickbooks } from "../clients/quickbooks-client.js";
import { ToolResponse } from "../types/tool-response.js";
import { formatError } from "../helpers/format-error.js";

export interface UpdateTermInput {
  id: string;
  sync_token: string;
  name?: string;
  active?: boolean;
  due_days?: number;
  discount_days?: number;
  discount_percent?: number;
}

export async function updateQuickbooksTerm(data: UpdateTermInput): Promise<ToolResponse<any>> {
  try {
    const quickbooks = await getQuickbooks();
    const payload: any = { Id: data.id, SyncToken: data.sync_token, sparse: true };
    if (data.name) payload.Name = data.name;
    if (data.active !== undefined) payload.Active = data.active;
    if (data.due_days !== undefined) payload.DueDays = data.due_days;
    if (data.discount_days !== undefined) payload.DiscountDays = data.discount_days;
    if (data.discount_percent !== undefined) payload.DiscountPercent = data.discount_percent;

    return new Promise((resolve) => {
      (quickbooks as any).updateTerm(payload, (err: any, updated: any) => {
        if (err) resolve({ result: null, isError: true, error: formatError(err) });
        else resolve({ result: updated, isError: false, error: null });
      });
    });
  } catch (error) {
    return { result: null, isError: true, error: formatError(error) };
  }
}
