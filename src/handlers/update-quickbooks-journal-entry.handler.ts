import { QuickbooksClient } from "../clients/quickbooks-client.js";
import { ToolResponse } from "../types/tool-response.js";
import { formatError } from "../helpers/format-error.js";
import { mergeForFullUpdate, promisifyGetter } from "../helpers/read-merge-write.js";

/**
 * Update a journal entry in QuickBooks Online
 * @param journalEntryData The journal entry object to update
 */
export async function updateQuickbooksJournalEntry(journalEntryData: any): Promise<ToolResponse<any>> {
  try {
    const quickbooks = await QuickbooksClient.getInstance();

    // Read-merge-write: QBO's full-update semantics null omitted fields and
    // sparse updates are unreliable. Fetch the current entity, merge the
    // caller's changes over it, and send a complete payload.

    const merged = await mergeForFullUpdate(promisifyGetter(quickbooks, "getJournalEntry"), journalEntryData);

    return new Promise((resolve) => {
      quickbooks.updateJournalEntry(merged, (err: any, journalEntry: any) => {
        if (err) {
          resolve({
            result: null,
            isError: true,
            error: formatError(err),
          });
        } else {
          resolve({
            result: journalEntry,
            isError: false,
            error: null,
          });
        }
      });
    });
  } catch (error) {
    return {
      result: null,
      isError: true,
      error: formatError(error),
    };
  }
} 
