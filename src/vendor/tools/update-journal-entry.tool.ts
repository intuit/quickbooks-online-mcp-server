import { updateQuickbooksJournalEntry } from "../handlers/update-quickbooks-journal-entry.handler.js";
import { ToolDefinition } from "../types/tool-definition.js";
import { z } from "zod";

// Define the tool metadata
const toolName = "update_journal_entry";
const toolDescription = "Update a journal entry in QuickBooks Online.";

// Define the expected input schema for updating a journal entry.
// .passthrough() forwards valid-but-unmodeled QBO fields (Entity, Adjustment,
// CurrencyRef/ExchangeRate, TxnTaxDetail, custom fields) instead of stripping
// them.
const toolSchema = z.object({
  journalEntry: z.object({
    Id: z.string().describe("The journal entry ID to update"),
    SyncToken: z.string().describe("Current SyncToken (required for concurrency control)"),
    sparse: z.boolean().optional().describe("If true, only update provided fields"),
    TxnDate: z.string().optional().describe("Transaction date in YYYY-MM-DD format"),
    PrivateNote: z.string().optional().describe("Private memo"),
    DocNumber: z.string().optional().describe("Journal number"),
    Line: z.array(z.object({
      Id: z.string().optional(),
      Amount: z.number(),
      DetailType: z.literal("JournalEntryLineDetail"),
      Description: z.string().optional().describe("Line description (must be at Line level, NOT inside JournalEntryLineDetail)"),
      JournalEntryLineDetail: z.object({
        PostingType: z.enum(["Debit", "Credit"]),
        AccountRef: z.object({
          value: z.string(),
          name: z.string().optional(),
        }),
        ClassRef: z.object({
          value: z.string(),
          name: z.string().optional(),
        }).optional(),
        DepartmentRef: z.object({
          value: z.string(),
          name: z.string().optional(),
        }).optional(),
      }).passthrough(),
    }).passthrough()).optional(),
  }).passthrough(),
});

type ToolParams = z.infer<typeof toolSchema>;

// Define the tool handler
const toolHandler = async (args: { [x: string]: any }) => {
  const response = await updateQuickbooksJournalEntry(args.params.journalEntry);

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