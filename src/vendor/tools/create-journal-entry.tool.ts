import { createQuickbooksJournalEntry } from "../handlers/create-quickbooks-journal-entry.handler.js";
import { ToolDefinition } from "../types/tool-definition.js";
import { z } from "zod";

// Define the tool metadata
const toolName = "create_journal_entry";
const toolDescription = "Create a journal entry in QuickBooks Online. Description goes on the Line level, not inside JournalEntryLineDetail.";

// Define the expected input schema for creating a journal entry.
// .passthrough() is used on the object levels so valid QBO fields that aren't
// explicitly modeled here (e.g. Entity for A/R+A/P lines, Adjustment,
// CurrencyRef/ExchangeRate, TxnTaxDetail, custom fields) are forwarded to the
// API instead of being silently stripped. Mirrors create-bill.tool.ts.
const toolSchema = z.object({
  journalEntry: z.object({
    TxnDate: z.string().describe("Transaction date in YYYY-MM-DD format"),
    PrivateNote: z.string().optional().describe("Private memo for the journal entry"),
    DocNumber: z.string().optional().describe("Journal number"),
    Line: z.array(z.object({
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
    }).passthrough()),
  }).passthrough(),
});

type ToolParams = z.infer<typeof toolSchema>;

// Define the tool handler
const toolHandler = async (args: { [x: string]: any }) => {
  const response = await createQuickbooksJournalEntry(args.params.journalEntry);

  if (response.isError) {
    return {
      content: [
        { type: "text" as const, text: `Error creating journal entry: ${response.error}` },
      ],
    };
  }

  return {
    content: [
      { type: "text" as const, text: `Journal entry created:` },
      { type: "text" as const, text: JSON.stringify(response.result) },
    ],
  };
};

export const CreateJournalEntryTool: ToolDefinition<typeof toolSchema> = {
  name: toolName,
  description: toolDescription,
  schema: toolSchema,
  handler: toolHandler,
}; 