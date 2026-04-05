// src/tools/promoted/search-accounts.tool.ts
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { executeSearch } from "../../handlers/generic-handler.js";
import { formatError } from "../../helpers/format-error.js";

const inputSchema = {
  criteria: z
    .array(
      z.object({
        field: z
          .enum([
            "Id",
            "Name",
            "AccountType",
            "Classification",
            "Active",
            "CurrentBalance",
            "MetaData.CreateTime",
            "MetaData.LastUpdatedTime",
          ])
          .describe("Account field to filter on."),
        value: z.union([z.string(), z.number(), z.boolean()]).describe("Value to match."),
        operator: z
          .enum(["=", "<", ">", "<=", ">=", "LIKE", "IN"])
          .default("=")
          .describe("Comparison operator."),
      }),
    )
    .optional()
    .describe("Filters to apply. Omit for full chart of accounts."),
  limit: z.number().int().min(1).max(1000).default(100).describe("Max results."),
  offset: z.number().int().min(0).default(0).describe("Skip N results."),
};

export function registerSearchAccounts(server: McpServer) {
  server.registerTool(
    "search_accounts",
    {
      description:
        "Search the chart of accounts in QuickBooks Online. Returns account records with IDs, names, types, classifications, and balances. Use this to find account IDs needed for journal entries and purchases.",
      inputSchema,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ criteria, limit, offset }) => {
      try {
        const searchPayload: any[] = [
          ...(criteria ?? []).map((c) => ({ field: c.field, value: c.value, operator: c.operator })),
        ];
        if (limit) searchPayload.push({ field: "limit", value: limit });
        if (offset) searchPayload.push({ field: "offset", value: offset });

        const results = await executeSearch("account", searchPayload.length > 0 ? searchPayload : {});
        return {
          content: [
            { type: "text" as const, text: `Found ${results.length} account(s):` },
            { type: "text" as const, text: JSON.stringify(results, null, 2) },
          ],
        };
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: `Error searching accounts: ${formatError(error)}` }],
        };
      }
    },
  );
}
