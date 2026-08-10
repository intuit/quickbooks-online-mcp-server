import { getQuickbooksJournalEntry } from "../handlers/get-quickbooks-journal-entry.handler.js";
import { ToolDefinition } from "../types/tool-definition.js";
import { z } from "zod";

// Define the tool metadata
const toolName = "get_journal_entry";
const toolDescription = "Get a journal entry by Id from QuickBooks Online.";

// Uniform envelope: {params:{id}} like every other get_* tool, with tolerant
// aliases (journal_entry_id, entry_id) accepted for backward compatibility
// with callers that used a different nesting (defect #13).
const toolSchema = z
  .object({
    id: z.string().optional().describe("Journal entry ID"),
    journal_entry_id: z.string().optional().describe("Alias of id"),
    entry_id: z.string().optional().describe("Alias of id"),
  })
  .refine((v) => v.id || v.journal_entry_id || v.entry_id, {
    message: "Provide the journal entry id (params.id)",
  });

type ToolParams = z.infer<typeof toolSchema>;

// Define the tool handler
const toolHandler = async (args: any) => {
  const p = args?.params ?? args ?? {};
  const id = p.id ?? p.journal_entry_id ?? p.entry_id;
  const response = await getQuickbooksJournalEntry(id);

  if (response.isError) {
    return {
      content: [
        { type: "text" as const, text: `Error getting journal entry: ${response.error}` },
      ],
    };
  }

  return {
    content: [
      { type: "text" as const, text: `Journal entry retrieved:` },
      { type: "text" as const, text: JSON.stringify(response.result) },
    ],
  };
};

export const GetJournalEntryTool: ToolDefinition<typeof toolSchema> = {
  name: toolName,
  description: toolDescription,
  schema: toolSchema,
  handler: toolHandler,
}; 