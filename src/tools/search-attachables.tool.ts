import { searchQuickbooksAttachables } from "../handlers/search-quickbooks-attachables.handler.js";
import { ToolDefinition } from "../types/tool-definition.js";
import { z } from "zod";

const toolName = "search_attachables";
const toolDescription = "Search for attachables (file attachments) in QuickBooks Online. Provide entityType (e.g. 'Purchase', 'Bill') and entityId to find attachments for a specific transaction. Omit both to get all attachables.";

const toolSchema = z.object({
  entityType: z.string().optional().describe("Entity type to filter by: 'Purchase', 'Bill', 'Invoice', etc."),
  entityId: z.string().optional().describe("Entity ID to filter by (e.g. '322')"),
});

const toolHandler = async (args: any) => {
  const entityType = args.params?.entityType;
  const entityId = args.params?.entityId;

  // Always fetch all attachables - QB query syntax for array fields is unreliable
  const response = await searchQuickbooksAttachables({ fetchAll: true });

  if (response.isError) {
    return {
      content: [
        { type: "text" as const, text: `Error searching attachables: ${response.error}` },
      ],
    };
  }

  let attachables = response.result || [];

  // Filter client-side if entityType and entityId provided
  if (entityType && entityId) {
    attachables = attachables.filter((att: any) => {
      const refs = att.AttachableRef || [];
      return refs.some((ref: any) =>
        ref.EntityRef?.type === entityType &&
        ref.EntityRef?.value === entityId
      );
    });
  } else if (entityType) {
    // Filter by just entity type
    attachables = attachables.filter((att: any) => {
      const refs = att.AttachableRef || [];
      return refs.some((ref: any) => ref.EntityRef?.type === entityType);
    });
  }

  return {
    content: [
      { type: "text" as const, text: `Found ${attachables.length} attachables: ${JSON.stringify(attachables)}` },
    ],
  };
};

export const SearchAttachablesTool: ToolDefinition<typeof toolSchema> = {
  name: toolName,
  description: toolDescription,
  schema: toolSchema,
  handler: toolHandler,
};
