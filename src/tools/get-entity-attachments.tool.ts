import { getQuickbooksEntityAttachments } from "../handlers/search-quickbooks-attachables.handler.js";
import { ToolDefinition } from "../types/tool-definition.js";
import { z } from "zod";

const toolName = "get_entity_attachments";
const toolDescription =
  "List the attachments of a specific QuickBooks transaction/entity (bill, purchase, invoice, ...). Scans attachables newest-first and filters by AttachableRef server-side. Response includes 'complete': false when the scan cap was reached before exhausting the file — raise max_scan to search deeper.";

const toolSchema = z.object({
  entity_type: z
    .string()
    .min(1)
    .describe("QBO entity type the attachment is linked to, e.g. 'Bill', 'Purchase', 'Invoice', 'JournalEntry'"),
  entity_id: z.string().min(1).describe("The entity's QBO Id"),
  max_scan: z
    .number()
    .optional()
    .describe("Maximum attachables to scan newest-first before giving up (default 5000)"),
});

const toolHandler = async ({ params }: any) => {
  const response = await getQuickbooksEntityAttachments(params);
  if (response.isError) return { content: [{ type: "text" as const, text: `Error: ${response.error}` }] };
  const { matches, scanned, complete } = response.result;
  return {
    content: [
      {
        type: "text" as const,
        text: `Found ${matches.length} attachment(s) for ${params.entity_type} ${params.entity_id} (scanned ${scanned} attachables${complete ? "" : " — scan cap reached, result may be incomplete; raise max_scan"}):`,
      },
      { type: "text" as const, text: JSON.stringify(matches, null, 2) },
    ],
  };
};

export const GetEntityAttachmentsTool: ToolDefinition<typeof toolSchema> = {
  name: toolName,
  description: toolDescription,
  schema: toolSchema,
  handler: toolHandler,
};
