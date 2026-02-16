import { createQuickbooksJournalEntry } from "../handlers/create-quickbooks-journal-entry.handler.js";
import { ToolDefinition } from "../types/tool-definition.js";
import { z } from "zod";

// Define the tool metadata
const toolName = "create_journal_entry";
const toolDescription = "Create a journal entry in QuickBooks Online.";

// Define the expected input schema for creating a journal entry
const toolSchema = z.object({
  journalEntry: z.any(),
});

type ToolParams = z.infer<typeof toolSchema>;

// Define the tool handler
const toolHandler = async (args: any) => {
  // Robust extraction: handle various input shapes
  let journalEntryData = args?.params?.journalEntry;
  
  // If journalEntry is a string (LLM sent stringified JSON), parse it
  if (typeof journalEntryData === 'string') {
    try {
      journalEntryData = JSON.parse(journalEntryData);
    } catch (e) {
      return {
        content: [
          { type: "text" as const, text: `Error creating journal entry: journalEntry is a string but not valid JSON: ${journalEntryData.substring(0, 200)}` },
        ],
      };
    }
  }
  
  // Validate we have usable data
  if (!journalEntryData || typeof journalEntryData !== 'object' || !journalEntryData.Line) {
    return {
      content: [
        { type: "text" as const, text: `Error creating journal entry: journalEntry must be an object with a Line array. Received: ${JSON.stringify(journalEntryData)?.substring(0, 500)}` },
      ],
    };
  }
  
  const response = await createQuickbooksJournalEntry(journalEntryData);

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