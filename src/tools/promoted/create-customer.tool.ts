// src/tools/promoted/create-customer.tool.ts
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { executeCreate } from "../../handlers/generic-handler.js";
import { formatError } from "../../helpers/format-error.js";

const inputSchema = {
  DisplayName: z
    .string()
    .min(1)
    .describe("Unique display name for the customer. Required."),
  GivenName: z.string().optional().describe("Customer's first name."),
  FamilyName: z.string().optional().describe("Customer's last name."),
  CompanyName: z.string().optional().describe("Customer's company name."),
  PrimaryEmailAddr: z
    .object({ Address: z.email() })
    .optional()
    .describe("Primary email. Format: { Address: 'email@example.com' }"),
  PrimaryPhone: z
    .object({ FreeFormNumber: z.string() })
    .optional()
    .describe("Primary phone. Format: { FreeFormNumber: '555-1234' }"),
  BillAddr: z
    .object({
      Line1: z.string().optional(),
      City: z.string().optional(),
      CountrySubDivisionCode: z.string().optional().describe("State/province code, e.g. 'CA'"),
      PostalCode: z.string().optional(),
    })
    .optional()
    .describe("Billing address."),
};

export function registerCreateCustomer(server: McpServer) {
  server.registerTool(
    "create_customer",
    {
      description:
        "Create a new customer in QuickBooks Online. Returns the created customer with its ID. The DisplayName must be unique across all customers. Use search_customers first to check for duplicates.",
      inputSchema,
      annotations: { openWorldHint: true },
    },
    async (params) => {
      try {
        const result = await executeCreate("customer", params);
        return {
          content: [
            {
              type: "text" as const,
              text: `Customer created (ID: ${result.Id}, DisplayName: "${result.DisplayName}"):`,
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
              text: `Error creating customer: ${formatError(error)}. Verify DisplayName is unique — use search_customers to check.`,
            },
          ],
        };
      }
    },
  );
}
