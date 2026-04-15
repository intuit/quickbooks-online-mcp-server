import { getQuickbooks } from "../clients/quickbooks-client.js";
import { ToolResponse } from "../types/tool-response.js";
import { formatError } from "../helpers/format-error.js";

/**
 * Update a journal entry in QuickBooks Online
 * @param journalEntryData The journal entry object to update
 */
export async function updateQuickbooksJournalEntry(journalEntryData: any): Promise<ToolResponse<any>> {
  try {
    const quickbooks = await getQuickbooks();

    return new Promise((resolve) => {
      quickbooks.updateJournalEntry(journalEntryData, (err: any, journalEntry: any) => {
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