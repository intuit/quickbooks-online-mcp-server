import { ToolDefinition } from "../types/tool-definition.js";
import { z } from "zod";
import { buildQboLink, supportedLinkEntityTypes } from "../helpers/qbo-entity-link.js";

const toolName = "get_transaction_link";
const toolDescription =
  "Get the QuickBooks Online web deep link for a transaction so it can be opened (and, if mis-created, deleted/voided manually) in the browser. IMPORTANT: the link's txnId resolves against whichever company is ACTIVE in the browser session, not necessarily this server's company — the link is prefixed with this server's company name; confirm the QBO page header matches it before acting. Deleting/voiding is deliberately NOT possible through this API.";

const toolSchema = z.object({
  entity_type: z
    .string()
    .min(1)
    .describe(
      `Transaction type. Supported: ${supportedLinkEntityTypes().join(", ")}`
    ),
  id: z.string().min(1).describe("The transaction's QBO Id"),
});

const toolHandler = async ({ params }: any) => {
  const link = await buildQboLink(params.entity_type, params.id);
  if (!link) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Error: unsupported entity_type "${params.entity_type}". Supported: ${supportedLinkEntityTypes().join(", ")}`,
        },
      ],
    };
  }
  return {
    content: [
      {
        type: "text" as const,
        text: `${link}\n(Confirm the company shown in the QBO header matches the bracketed name before deleting/editing — txnId resolves against the browser's active company.)`,
      },
    ],
  };
};

export const GetTransactionLinkTool: ToolDefinition<typeof toolSchema> = {
  name: toolName,
  description: toolDescription,
  schema: toolSchema,
  handler: toolHandler,
};
