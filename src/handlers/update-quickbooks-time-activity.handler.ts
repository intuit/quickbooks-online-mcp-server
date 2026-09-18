import { QuickbooksClient } from "../clients/quickbooks-client.js";
import { ToolResponse } from "../types/tool-response.js";
import { formatError } from "../helpers/format-error.js";
import { mergeForFullUpdate, promisifyGetter } from "../helpers/read-merge-write.js";

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
    const quickbooks = await QuickbooksClient.getInstance();
    const payload: any = { Id: data.id, SyncToken: data.sync_token, sparse: true };
    if (data.hours !== undefined) payload.Hours = data.hours;
    if (data.minutes !== undefined) payload.Minutes = data.minutes;
    if (data.description) payload.Description = data.description;
    if (data.billable_status) payload.BillableStatus = data.billable_status;
    if (data.item_ref) payload.ItemRef = { value: data.item_ref };

    // Read-merge-write: QBO sparse updates are unreliable (omitted fields
    // can be nulled; line-bearing sparse updates are rejected). Fetch the
    // current entity, merge changes over it, send a full update.

    const merged = await mergeForFullUpdate(promisifyGetter(quickbooks, "getTimeActivity"), payload);

    return new Promise((resolve) => {
      (quickbooks as any).updateTimeActivity(merged, (err: any, updated: any) => {
        if (err) resolve({ result: null, isError: true, error: formatError(err) });
        else resolve({ result: updated, isError: false, error: null });
      });
    });
  } catch (error) {
    return { result: null, isError: true, error: formatError(error) };
  }
}

