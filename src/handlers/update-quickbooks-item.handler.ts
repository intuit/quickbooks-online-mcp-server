import { getQuickbooks } from "../clients/quickbooks-client.js";
import { ToolResponse } from "../types/tool-response.js";
import { formatError } from "../helpers/format-error.js";

export interface UpdateItemInput {
  item_id: string;
  patch: Record<string, any>; // Sparse update fields per Quickbooks spec
}

export async function updateQuickbooksItem({ item_id, patch }: UpdateItemInput): Promise<ToolResponse<any>> {
  try {
    const quickbooks = await getQuickbooks();

    // Need SyncToken; fetch existing item first
    const existing: any = await new Promise((res, rej) => {
      (quickbooks as any).getItem(item_id, (e: any, item: any) => (e ? rej(e) : res(item)));
    });

    const payload = { ...existing, ...patch, Id: item_id, sparse: true };

    return new Promise((resolve) => {
      (quickbooks as any).updateItem(payload, (err: any, updated: any) => {
        if (err) {
          resolve({ result: null, isError: true, error: formatError(err) });
        } else {
          resolve({ result: updated, isError: false, error: null });
        }
      });
    });
  } catch (error) {
    return { result: null, isError: true, error: formatError(error) };
  }
} 