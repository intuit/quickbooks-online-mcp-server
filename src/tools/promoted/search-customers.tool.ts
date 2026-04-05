// src/tools/promoted/search-customers.tool.ts
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
            "DisplayName",
            "GivenName",
            "FamilyName",
            "CompanyName",
            "PrimaryEmailAddr",
            "PrimaryPhone",
            "Balance",
            "Active",
            "MetaData.CreateTime",
            "MetaData.LastUpdatedTime",
          ])
          .describe("Customer field to filter on."),
        value: z.union([z.string(), z.number(), z.boolean()]).describe("Value to match."),
        operator: z
          .enum(["=", "<", ">", "<=", ">=", "LIKE", "IN"])
          .default("=")
          .describe("Comparison operator. Use LIKE with % for partial matches (e.g. 'John%')."),
      }),
    )
    .optional()
    .describe("Filters to apply. Omit for unfiltered search."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(1000)
    .default(100)
    .describe("Max results. Default 100."),
  offset: z
    .number()
    .int()
    .min(0)
    .default(0)
    .describe("Number of results to skip for pagination."),
  asc: z.string().optional().describe("Sort ascending by this field name."),
  desc: z.string().optional().describe("Sort descending by this field name."),
};

export function registerSearchCustomers(server: McpServer) {
  server.registerTool(
    "search_customers",
    {
      description:
        "Search for customers in QuickBooks Online. Returns matching customer records with IDs, names, contact info, and balances. Use this to find customer IDs before creating invoices or to look up customer details. For operations on a specific customer (update, delete), use execute_action with the customer's ID.",
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

        const results = await executeSearch("customer", searchPayload.length > 0 ? searchPayload : {});
        return {
          content: [
            { type: "text" as const, text: `Found ${results.length} customer(s):` },
            { type: "text" as const, text: JSON.stringify(results, null, 2) },
          ],
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `Error searching customers: ${formatError(error)}`,
            },
          ],
        };
      }
    },
  );
}
