#!/usr/bin/env node

/**
 * Entry point for the QuickBooks Online MCP Server.
 * Initializes the server with all available tools:
 * - Catalog tools: search_actions and execute_action for discovering and running any of 50 operations
 * - Promoted tools: search_customers, create_customer, create_invoice, search_invoices, search_accounts
 * - Write tools (create_customer, create_invoice) are only registered when not in read-only mode
 * Connects to Claude via stdio transport for use as an MCP server.
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { QuickbooksMCPServer } from "./server/qbo-mcp-server.js";
import { isReadOnly } from "./config.js";

// Catalog tools (search + execute pattern)
import { registerSearchActions } from "./tools/search-actions.tool.js";
import { registerExecuteAction } from "./tools/execute-action.tool.js";

// Promoted tools (high-use, direct access)
import { registerSearchCustomers } from "./tools/promoted/search-customers.tool.js";
import { registerCreateCustomer } from "./tools/promoted/create-customer.tool.js";
import { registerCreateInvoice } from "./tools/promoted/create-invoice.tool.js";
import { registerSearchInvoices } from "./tools/promoted/search-invoices.tool.js";
import { registerSearchAccounts } from "./tools/promoted/search-accounts.tool.js";

const main = async () => {
  const server = QuickbooksMCPServer.GetServer();

  // Catalog tools — discover and execute any of 50 operations
  registerSearchActions(server);
  registerExecuteAction(server);

  // Promoted tools — search tools always available
  registerSearchCustomers(server);
  registerSearchInvoices(server);
  registerSearchAccounts(server);

  // Write tools only registered when not in read-only mode
  if (!isReadOnly) {
    registerCreateCustomer(server);
    registerCreateInvoice(server);
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
};

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
