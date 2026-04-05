// src/tools/promoted/create-invoice.tool.ts
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { executeCreate } from "../../handlers/generic-handler.js";
import { formatError } from "../../helpers/format-error.js";

const lineItemSchema = z.object({
  Description: z.string().optional().describe("Line item description shown on the invoice."),
  Amount: z.number().describe("Total amount for this line (Qty * UnitPrice)."),
  DetailType: z
    .literal("SalesItemLineDetail")
    .describe("Must be 'SalesItemLineDetail'."),
  SalesItemLineDetail: z.object({
    ItemRef: z
      .object({ value: z.string() })
      .describe("Reference to the item. Get the ID from search_actions → search_items."),
    Qty: z.number().min(1).describe("Quantity."),
    UnitPrice: z.number().describe("Price per unit."),
  }),
});

const inputSchema = {
  CustomerRef: z
    .object({ value: z.string() })
    .describe(
      "Reference to the customer. Get the ID from search_customers first.",
    ),
  Line: z
    .array(lineItemSchema)
    .min(1)
    .describe("Invoice line items. At least one required."),
  DocNumber: z
    .string()
    .optional()
    .describe("Custom document number. Auto-generated if omitted."),
  TxnDate: z
    .string()
    .optional()
    .describe("Transaction date in YYYY-MM-DD format. Defaults to today."),
  DueDate: z
    .string()
    .optional()
    .describe("Payment due date in YYYY-MM-DD format."),
  PrivateNote: z
    .string()
    .optional()
    .describe("Internal note (not shown to customer)."),
};

export function registerCreateInvoice(server: McpServer) {
  server.registerTool(
    "create_invoice",
    {
      description:
        "Create an invoice in QuickBooks Online. Requires a customer reference and at least one line item. Search for customer and item IDs first using search_customers and search_actions → search_items. Returns the created invoice with its ID and calculated totals.",
      inputSchema,
      annotations: { openWorldHint: true },
    },
    async (params) => {
      try {
        const result = await executeCreate("invoice", params);
        return {
          content: [
            {
              type: "text" as const,
              text: `Invoice created (ID: ${result.Id}, DocNumber: ${result.DocNumber ?? "auto"}, Total: $${result.TotalAmt}):`,
            },
            { type: "text" as const, text: JSON.stringify(result, null, 2) },
          ],
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `Error creating invoice: ${formatError(error)}. Verify CustomerRef and ItemRef IDs are valid — use search_customers and execute_action with search_items.`,
            },
          ],
        };
      }
    },
  );
}
