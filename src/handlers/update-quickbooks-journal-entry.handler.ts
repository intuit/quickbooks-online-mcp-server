import { QuickbooksClient } from "../clients/quickbooks-client.js";
import { ToolResponse } from "../types/tool-response.js";
import { formatError } from "../helpers/format-error.js";

export interface UpdateJournalEntryInput {
  journal_entry_id: string;
  patch: Record<string, any>; // Fields to change; everything else is kept
}

/**
 * Sparse-update a journal entry in QuickBooks Online. Fetches the current record so
 * callers only send the fields they want to change (a caller-supplied
 * SyncToken in the patch wins over the fetched one).
 */
export async function updateQuickbooksJournalEntry({ journal_entry_id, patch }: UpdateJournalEntryInput): Promise<ToolResponse<any>> {
  try {
    const quickbooks = await QuickbooksClient.getInstance();

    const existing: any = await new Promise((res, rej) => {
      (quickbooks as any).getJournalEntry(journal_entry_id, (e: any, found: any) => (e ? rej(e) : res(found)));
    });

    const updatePayload = { ...existing, ...patch, Id: journal_entry_id, sparse: true };

    return new Promise((resolve) => {
      quickbooks.updateJournalEntry(updatePayload, (err: any, updated: any) => {
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
