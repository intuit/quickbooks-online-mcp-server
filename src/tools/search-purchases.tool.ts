import { searchQuickbooksPurchases } from "../handlers/search-quickbooks-purchases.handler.js";
import { ToolDefinition } from "../types/tool-definition.js";
import { z } from "zod";

// Define the tool metadata
const toolName = "search_purchases";
const toolDescription =
  "Search for purchases (expenses) in QuickBooks Online. " +
  "The QBXML query language only supports filtering purchases on Id, TxnDate, TotalAmt, DocNumber, " +
  "PaymentType, MetaData.CreateTime and MetaData.LastUpdatedTime; the vendor reference (EntityRef) is NOT " +
  "queryable. To find a vendor's purchases, use get_transaction_list with the vendor parameter instead.";

// Define the expected input schema for searching purchases
const toolSchema = z.object({
  criteria: z
    .array(z.any())
    .optional()
    .describe(
      "Search criteria. Only the queryable Purchase fields are accepted: Id, TxnDate, TotalAmt, DocNumber, " +
        "PaymentType, MetaData.CreateTime, MetaData.LastUpdatedTime. Filtering on EntityRef/VendorRef or " +
        "line fields fails with a 400 — use get_transaction_list for vendor-based lookups. " +
        "Example: [{field: 'TxnDate', value: '2026-01-01', operator: '>='}]."
    ),
  asc: z.string().optional(),
  desc: z.string().optional(),
  limit: z.number().optional(),
  offset: z.number().optional(),
  count: z.boolean().optional(),
  fetchAll: z.boolean().optional(),
});

type ToolParams = z.infer<typeof toolSchema>;

// Define the tool handler
const toolHandler = async (args: any) => {
  const response = await searchQuickbooksPurchases(args.params);

  if (response.isError) {
    return {
      content: [
        { type: "text" as const, text: `Error searching purchases: ${response.error}` },
      ],
    };
  }

  return {
    content: [
      { type: "text" as const, text: `Purchases found:` },
      { type: "text" as const, text: JSON.stringify(response.result) },
    ],
  };
};

export const SearchPurchasesTool: ToolDefinition<typeof toolSchema> = {
  name: toolName,
  description: toolDescription,
  schema: toolSchema,
  handler: toolHandler,
};
