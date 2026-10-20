import { QuickbooksClient } from "../clients/quickbooks-client.js";
import { ToolResponse } from "../types/tool-response.js";
import { formatError } from "../helpers/format-error.js";

export interface UpdateEstimateInput {
  estimate_id: string;
  patch: Record<string, any>; // Sparse update fields per Quickbooks spec
}

/**
 * Sparse-update an estimate in QuickBooks Online. Fetches the current estimate
 * for its SyncToken so callers only send the fields they want to change.
 */
export async function updateQuickbooksEstimate({ estimate_id, patch }: UpdateEstimateInput): Promise<ToolResponse<any>> {
  try {
    const quickbooks = await QuickbooksClient.getInstance();

    // Need SyncToken; fetch existing estimate first
    const existing: any = await new Promise((res, rej) => {
      (quickbooks as any).getEstimate(estimate_id, (e: any, est: any) => (e ? rej(e) : res(est)));
    });

    const updatePayload = { ...existing, ...patch, Id: estimate_id, sparse: true };

    return new Promise((resolve) => {
      quickbooks.updateEstimate(updatePayload, (err: any, estimate: any) => {
        if (err) {
          resolve({ result: null, isError: true, error: formatError(err) });
        } else {
          resolve({ result: estimate, isError: false, error: null });
        }
      });
    });
  } catch (error) {
    return { result: null, isError: true, error: formatError(error) };
  }
}
