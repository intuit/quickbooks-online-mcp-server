import { quickbooksClient } from "../clients/quickbooks-client.js";
import { ToolResponse } from "../types/tool-response.js";
import { formatError } from "../helpers/format-error.js";

export interface UpdateTimeActivityInput {
  id: string;
  sync_token: string;
  hours?: number;
  minutes?: number;
  description?: string;
  billable_status?: "Billable" | "NotBillable" | "HasBeenBilled";
  item_ref?: string;
}

export async function updateQuickbooksTimeActivity(data: UpdateTimeActivityInput): Promise<ToolResponse<any>> {
  try {
    await quickbooksClient.authenticate();
    const quickbooks = quickbooksClient.getQuickbooks();
    const payload: any = { Id: data.id, SyncToken: data.sync_token, sparse: true };
    if (data.hours !== undefined) payload.Hours = data.hours;
    if (data.minutes !== undefined) payload.Minutes = data.minutes;
    if (data.description) payload.Description = data.description;
    if (data.billable_status) payload.BillableStatus = data.billable_status;
    if (data.item_ref) payload.ItemRef = { value: data.item_ref };

    return new Promise((resolve) => {
      (quickbooks as any).updateTimeActivity(payload, (err: any, updated: any) => {
        if (err) resolve({ result: null, isError: true, error: formatError(err) });
        else resolve({ result: updated, isError: false, error: null });
      });
    });
  } catch (error) {
    return { result: null, isError: true, error: formatError(error) };
  }
}
