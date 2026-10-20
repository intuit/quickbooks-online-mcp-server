import { updateQuickbooksJournalEntry } from "../handlers/update-quickbooks-journal-entry.handler.js";
import { ToolDefinition } from "../types/tool-definition.js";
import { z } from "zod";

const toolName = "update_journal_entry";
const toolDescription =
  "Updates a journal entry in QuickBooks Online. Changes only the fields you send in `patch`; other fields are kept. A `Line` array replaces all lines. Nested objects (e.g. BillAddr, ShipAddr, PrimaryEmailAddr) replace the whole object — send all of its sub-fields.";

const toolSchema = z.object({
  journal_entry_id: z.string().min(1),
  patch: z.record(z.any()),
});

const toolHandler = async ({ params }: any) => {
  const response = await updateQuickbooksJournalEntry(params);

  if (response.isError) {
    return {
      content: [
        { type: "text" as const, text: `Error updating journal entry: ${response.error}` },
      ],
    };
  }

  return {
    content: [
      { type: "text" as const, text: `Journal entry updated:` },
      { type: "text" as const, text: JSON.stringify(response.result) },
    ],
  };
};

export const UpdateJournalEntryTool: ToolDefinition<typeof toolSchema> = {
  name: toolName,
  description: toolDescription,
  schema: toolSchema,
  handler: toolHandler,
};
