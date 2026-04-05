// src/tools/search-actions.tool.ts
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { searchCatalog } from "../catalog/action-catalog.js";
import { isReadOnly } from "../config.js";

const inputSchema = {
  intent: z
    .string()
    .describe(
      "What you want to do, in plain English. Examples: 'create a customer', 'find invoices by date', 'delete a journal entry'.",
    ),
  limit: z
    .number()
    .int()
    .min(1)
    .max(20)
    .default(10)
    .describe("Max results to return. Default 10."),
};

/**
 * Registers the search_actions tool with the MCP server.
 * Searches the action catalog by intent and returns matching actions with descriptions and parameter hints.
 * @param server - The MCP server instance to register the tool with.
 */
export function registerSearchActions(server: McpServer) {
  server.registerTool(
    "search_actions",
    {
      description:
        "Find available QuickBooks operations matching an intent. Returns action IDs, descriptions, and parameter hints. Call this FIRST to discover what you can do, then use execute_action to run the action. Also see the 5 promoted tools: search_customers, create_customer, create_invoice, search_invoices, search_accounts.",
      inputSchema,
      annotations: { readOnlyHint: true },
    },
    async ({ intent, limit }) => {
      const matches = searchCatalog(intent, limit, isReadOnly);
      if (matches.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `No actions found for "${intent}". Try broader terms. Available entities: customer, invoice, estimate, bill, account, item, vendor, employee, journal_entry, bill_payment, purchase. Operations: create, get, update, delete, search.`,
            },
          ],
        };
      }
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              matches.map((m) => ({
                action_id: m.id,
                entity: m.entity,
                operation: m.operation,
                description: m.description,
                parameters: m.parameterHints,
              })),
              null,
              2,
            ),
          },
        ],
      };
    },
  );
}
