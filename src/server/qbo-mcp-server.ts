import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export class QuickbooksMCPServer {
  private static instance: McpServer | null = null;

  private constructor() {}

  public static GetServer(): McpServer {
    if (QuickbooksMCPServer.instance === null) {
      QuickbooksMCPServer.instance = new McpServer(
        {
          name: "QuickBooks Online MCP Server",
          version: "1.0.0",
        },
        {
          instructions: [
            "This server connects to the QuickBooks Online API. It manages 11 entity types: Customer, Invoice, Estimate, Bill, Account, Item, Vendor, Employee, JournalEntry, BillPayment, and Purchase.",
            "Use search_actions to discover available operations, then execute_action to run them. Five high-use tools are available directly: search_customers, create_customer, create_invoice, search_invoices, search_accounts.",
            "QuickBooks IDs are opaque strings — never guess them. Always search first to get valid IDs before calling get/update/delete operations.",
            "Updates require the entity's current SyncToken for optimistic locking. Fetch the entity first with a get operation to obtain the SyncToken, then include it in the update payload.",
            "Deleting a Customer or Vendor sets Active=false (soft delete). Other entity deletes are hard deletes.",
          ].join("\n"),
        },
      );
    }
    return QuickbooksMCPServer.instance;
  }
}