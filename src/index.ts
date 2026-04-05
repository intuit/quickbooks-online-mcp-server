#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { QuickbooksMCPServer } from "./server/qbo-mcp-server.js";

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

  // Promoted tools — fast path for the 5 most common operations
  registerSearchCustomers(server);
  registerCreateCustomer(server);
  registerCreateInvoice(server);
  registerSearchInvoices(server);
  registerSearchAccounts(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);
};

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
