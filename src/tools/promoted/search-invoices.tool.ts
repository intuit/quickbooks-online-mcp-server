// src/tools/promoted/search-invoices.tool.ts
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
            "DocNumber",
            "TxnDate",
            "DueDate",
            "CustomerRef",
            "Balance",
            "TotalAmt",
            "MetaData.CreateTime",
            "MetaData.LastUpdatedTime",
          ])
          .describe("Invoice field to filter on."),
        value: z.union([z.string(), z.number()]).describe("Value to match."),
        operator: z
          .enum(["=", "<", ">", "<=", ">=", "LIKE", "IN"])
          .default("=")
          .describe("Comparison operator."),
      }),
    )
    .optional()
    .describe("Filters to apply. Omit for all invoices."),
  limit: z.number().int().min(1).max(1000).default(100).describe("Max results."),
  offset: z.number().int().min(0).default(0).describe("Skip N results."),
  asc: z.string().optional().describe("Sort ascending by field."),
  desc: z.string().optional().describe("Sort descending by field."),
};

/**
 * Registers the search_invoices tool for finding invoices in QuickBooks Online.
 * @param server - The MCP server instance to register the tool on.
 */
export function registerSearchInvoices(server: McpServer) {
  server.registerTool(
    "search_invoices",
    {
      description:
        "Search invoices in QuickBooks Online. Returns invoice records with IDs, doc numbers, dates, line items, totals, and balances. Use this to find invoices by customer, date range, or amount. Does NOT search estimates or bills — use search_actions for those.",
      inputSchema,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ criteria, limit, offset, asc, desc }) => {
      try {
        const searchPayload: any[] = [
          ...(criteria ?? []).map((c) => ({ field: c.field, value: c.value, operator: c.operator })),
        ];
        if (limit) searchPayload.push({ field: "limit", value: limit });
        if (offset) searchPayload.push({ field: "offset", value: offset });
        if (asc) searchPayload.push({ field: "asc", value: asc });
        if (desc) searchPayload.push({ field: "desc", value: desc });

        const results = await executeSearch("invoice", searchPayload.length > 0 ? searchPayload : {});
        return {
          content: [
            { type: "text" as const, text: `Found ${results.length} invoice(s):` },
            { type: "text" as const, text: JSON.stringify(results, null, 2) },
          ],
        };
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: `Error searching invoices: ${formatError(error)}` }],
        };
      }
    },
  );
}
