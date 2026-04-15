#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { QuickbooksMCPServer, createMcpServer } from "./server/qbo-mcp-server.js";
import { RegisterTool } from "./helpers/register-tool.js";
import { authStorage } from "./clients/auth-context.js";
import http from "node:http";

// import { ListInvoicesTool } from "./tools/list-invoices.tool.js";
// import { CreateCustomerTool } from "./tools/create-customer.tool.js";
import { CreateInvoiceTool } from "./tools/create-invoice.tool.js";
import { ReadInvoiceTool } from "./tools/read-invoice.tool.js";
import { SearchInvoicesTool } from "./tools/search-invoices.tool.js";
import { UpdateInvoiceTool } from "./tools/update-invoice.tool.js";
import { CreateAccountTool } from "./tools/create-account.tool.js";
import { UpdateAccountTool } from "./tools/update-account.tool.js";
import { SearchAccountsTool } from "./tools/search-accounts.tool.js";
import { ReadItemTool } from "./tools/read-item.tool.js";
import { SearchItemsTool } from "./tools/search-items.tool.js";
import { CreateItemTool } from "./tools/create-item.tool.js";
import { UpdateItemTool } from "./tools/update-item.tool.js";
import { DeleteItemTool } from "./tools/delete-item.tool.js";
import { GetAccountTool } from "./tools/get-account.tool.js";
import { DeleteInvoiceTool } from "./tools/delete-invoice.tool.js";
// import { ListAccountsTool } from "./tools/list-accounts.tool.js";
// import { UpdateCustomerTool } from "./tools/update-customer.tool.js";
import { CreateCustomerTool } from "./tools/create-customer.tool.js";
import { GetCustomerTool } from "./tools/get-customer.tool.js";
import { UpdateCustomerTool } from "./tools/update-customer.tool.js";
import { DeleteCustomerTool } from "./tools/delete-customer.tool.js";
import { CreateEstimateTool } from "./tools/create-estimate.tool.js";
import { GetEstimateTool } from "./tools/get-estimate.tool.js";
import { UpdateEstimateTool } from "./tools/update-estimate.tool.js";
import { DeleteEstimateTool } from "./tools/delete-estimate.tool.js";
import { SearchCustomersTool } from "./tools/search-customers.tool.js";
import { SearchEstimatesTool } from "./tools/search-estimates.tool.js";
import { CreateBillTool } from "./tools/create-bill.tool.js";
import { UpdateBillTool } from "./tools/update-bill.tool.js";
import { DeleteBillTool } from "./tools/delete-bill.tool.js";
import { GetBillTool } from "./tools/get-bill.tool.js";
import { CreateVendorTool } from "./tools/create-vendor.tool.js";
import { UpdateVendorTool } from "./tools/update-vendor.tool.js";
import { DeleteVendorTool } from "./tools/delete-vendor.tool.js";
import { GetVendorTool } from "./tools/get-vendor.tool.js";
import { SearchBillsTool } from "./tools/search-bills.tool.js";
import { SearchVendorsTool } from "./tools/search-vendors.tool.js";

// Employee tools
import { CreateEmployeeTool } from "./tools/create-employee.tool.js";
import { GetEmployeeTool } from "./tools/get-employee.tool.js";
import { UpdateEmployeeTool } from "./tools/update-employee.tool.js";
import { SearchEmployeesTool } from "./tools/search-employees.tool.js";
import { DeleteEmployeeTool } from "./tools/delete-employee.tool.js";

// Journal Entry tools
import { CreateJournalEntryTool } from "./tools/create-journal-entry.tool.js";
import { GetJournalEntryTool } from "./tools/get-journal-entry.tool.js";
import { UpdateJournalEntryTool } from "./tools/update-journal-entry.tool.js";
import { DeleteJournalEntryTool } from "./tools/delete-journal-entry.tool.js";
import { SearchJournalEntriesTool } from "./tools/search-journal-entries.tool.js";

// Bill Payment tools
import { CreateBillPaymentTool } from "./tools/create-bill-payment.tool.js";
import { GetBillPaymentTool } from "./tools/get-bill-payment.tool.js";
import { UpdateBillPaymentTool } from "./tools/update-bill-payment.tool.js";
import { DeleteBillPaymentTool } from "./tools/delete-bill-payment.tool.js";
import { SearchBillPaymentsTool } from "./tools/search-bill-payments.tool.js";

// Purchase tools
import { CreatePurchaseTool } from "./tools/create-purchase.tool.js";
import { GetPurchaseTool } from "./tools/get-purchase.tool.js";
import { UpdatePurchaseTool } from "./tools/update-purchase.tool.js";
import { DeletePurchaseTool } from "./tools/delete-purchase.tool.js";
import { SearchPurchasesTool } from "./tools/search-purchases.tool.js";

// Payment tools
import { CreatePaymentTool } from "./tools/create-payment.tool.js";
import { GetPaymentTool } from "./tools/get-payment.tool.js";
import { UpdatePaymentTool } from "./tools/update-payment.tool.js";
import { DeletePaymentTool } from "./tools/delete-payment.tool.js";
import { SearchPaymentsTool } from "./tools/search-payments.tool.js";

// Sales Receipt tools
import { CreateSalesReceiptTool } from "./tools/create-sales-receipt.tool.js";
import { GetSalesReceiptTool } from "./tools/get-sales-receipt.tool.js";
import { UpdateSalesReceiptTool } from "./tools/update-sales-receipt.tool.js";
import { DeleteSalesReceiptTool } from "./tools/delete-sales-receipt.tool.js";
import { SearchSalesReceiptsTool } from "./tools/search-sales-receipts.tool.js";

// Credit Memo tools
import { CreateCreditMemoTool } from "./tools/create-credit-memo.tool.js";
import { GetCreditMemoTool } from "./tools/get-credit-memo.tool.js";
import { UpdateCreditMemoTool } from "./tools/update-credit-memo.tool.js";
import { DeleteCreditMemoTool } from "./tools/delete-credit-memo.tool.js";
import { SearchCreditMemosTool } from "./tools/search-credit-memos.tool.js";

// Refund Receipt tools
import { CreateRefundReceiptTool } from "./tools/create-refund-receipt.tool.js";
import { GetRefundReceiptTool } from "./tools/get-refund-receipt.tool.js";
import { UpdateRefundReceiptTool } from "./tools/update-refund-receipt.tool.js";
import { DeleteRefundReceiptTool } from "./tools/delete-refund-receipt.tool.js";
import { SearchRefundReceiptsTool } from "./tools/search-refund-receipts.tool.js";

// Purchase Order tools
import { CreatePurchaseOrderTool } from "./tools/create-purchase-order.tool.js";
import { GetPurchaseOrderTool } from "./tools/get-purchase-order.tool.js";
import { UpdatePurchaseOrderTool } from "./tools/update-purchase-order.tool.js";
import { DeletePurchaseOrderTool } from "./tools/delete-purchase-order.tool.js";
import { SearchPurchaseOrdersTool } from "./tools/search-purchase-orders.tool.js";

// Vendor Credit tools
import { CreateVendorCreditTool } from "./tools/create-vendor-credit.tool.js";
import { GetVendorCreditTool } from "./tools/get-vendor-credit.tool.js";
import { UpdateVendorCreditTool } from "./tools/update-vendor-credit.tool.js";
import { DeleteVendorCreditTool } from "./tools/delete-vendor-credit.tool.js";
import { SearchVendorCreditsTool } from "./tools/search-vendor-credits.tool.js";

// Deposit tools
import { CreateDepositTool } from "./tools/create-deposit.tool.js";
import { GetDepositTool } from "./tools/get-deposit.tool.js";
import { UpdateDepositTool } from "./tools/update-deposit.tool.js";
import { DeleteDepositTool } from "./tools/delete-deposit.tool.js";
import { SearchDepositsTool } from "./tools/search-deposits.tool.js";

// Transfer tools
import { CreateTransferTool } from "./tools/create-transfer.tool.js";
import { GetTransferTool } from "./tools/get-transfer.tool.js";
import { UpdateTransferTool } from "./tools/update-transfer.tool.js";
import { DeleteTransferTool } from "./tools/delete-transfer.tool.js";
import { SearchTransfersTool } from "./tools/search-transfers.tool.js";

// Time Activity tools
import { CreateTimeActivityTool } from "./tools/create-time-activity.tool.js";
import { GetTimeActivityTool } from "./tools/get-time-activity.tool.js";
import { UpdateTimeActivityTool } from "./tools/update-time-activity.tool.js";
import { DeleteTimeActivityTool } from "./tools/delete-time-activity.tool.js";
import { SearchTimeActivitiesTool } from "./tools/search-time-activities.tool.js";

// Class tools
import { CreateClassTool } from "./tools/create-class.tool.js";
import { GetClassTool } from "./tools/get-class.tool.js";
import { UpdateClassTool } from "./tools/update-class.tool.js";
import { SearchClassesTool } from "./tools/search-classes.tool.js";

// Department tools
import { CreateDepartmentTool } from "./tools/create-department.tool.js";
import { GetDepartmentTool } from "./tools/get-department.tool.js";
import { UpdateDepartmentTool } from "./tools/update-department.tool.js";
import { SearchDepartmentsTool } from "./tools/search-departments.tool.js";

// Term tools
import { CreateTermTool } from "./tools/create-term.tool.js";
import { GetTermTool } from "./tools/get-term.tool.js";
import { UpdateTermTool } from "./tools/update-term.tool.js";
import { SearchTermsTool } from "./tools/search-terms.tool.js";

// Payment Method tools
import { CreatePaymentMethodTool } from "./tools/create-payment-method.tool.js";
import { GetPaymentMethodTool } from "./tools/get-payment-method.tool.js";
import { UpdatePaymentMethodTool } from "./tools/update-payment-method.tool.js";
import { SearchPaymentMethodsTool } from "./tools/search-payment-methods.tool.js";

// Tax Code tools
import { GetTaxCodeTool } from "./tools/get-tax-code.tool.js";
import { SearchTaxCodesTool } from "./tools/search-tax-codes.tool.js";

// Tax Rate tools
import { GetTaxRateTool } from "./tools/get-tax-rate.tool.js";
import { SearchTaxRatesTool } from "./tools/search-tax-rates.tool.js";

// Tax Agency tools
import { GetTaxAgencyTool } from "./tools/get-tax-agency.tool.js";
import { SearchTaxAgenciesTool } from "./tools/search-tax-agencies.tool.js";

// Company Info tools
import { GetCompanyInfoTool } from "./tools/get-company-info.tool.js";
import { UpdateCompanyInfoTool } from "./tools/update-company-info.tool.js";

// Attachable tools
import { CreateAttachableTool } from "./tools/create-attachable.tool.js";
import { GetAttachableTool } from "./tools/get-attachable.tool.js";
import { UpdateAttachableTool } from "./tools/update-attachable.tool.js";
import { DeleteAttachableTool } from "./tools/delete-attachable.tool.js";
import { SearchAttachablesTool } from "./tools/search-attachables.tool.js";

// Financial Report tools
import { GetBalanceSheetTool } from "./tools/get-balance-sheet.tool.js";
import { GetProfitAndLossTool } from "./tools/get-profit-and-loss.tool.js";
import { GetCashFlowTool } from "./tools/get-cash-flow.tool.js";
import { GetTrialBalanceTool } from "./tools/get-trial-balance.tool.js";
import { GetGeneralLedgerTool } from "./tools/get-general-ledger.tool.js";

// Sales/AR Report tools
import { GetCustomerSalesTool } from "./tools/get-customer-sales.tool.js";
import { GetAgedReceivablesTool } from "./tools/get-aged-receivables.tool.js";
import { GetCustomerBalanceTool } from "./tools/get-customer-balance.tool.js";

// Expense/AP Report tools
import { GetAgedPayablesTool } from "./tools/get-aged-payables.tool.js";
import { GetVendorExpensesTool } from "./tools/get-vendor-expenses.tool.js";
import { GetVendorBalanceTool } from "./tools/get-vendor-balance.tool.js";

function registerAllTools(server: McpServer) {
  // Customers
  RegisterTool(server, CreateCustomerTool);
  RegisterTool(server, GetCustomerTool);
  RegisterTool(server, UpdateCustomerTool);
  RegisterTool(server, DeleteCustomerTool);
  RegisterTool(server, SearchCustomersTool);

  // Estimates
  RegisterTool(server, CreateEstimateTool);
  RegisterTool(server, GetEstimateTool);
  RegisterTool(server, UpdateEstimateTool);
  RegisterTool(server, DeleteEstimateTool);
  RegisterTool(server, SearchEstimatesTool);

  // Bills
  RegisterTool(server, CreateBillTool);
  RegisterTool(server, UpdateBillTool);
  RegisterTool(server, DeleteBillTool);
  RegisterTool(server, GetBillTool);
  RegisterTool(server, SearchBillsTool);

  // Invoices
  RegisterTool(server, ReadInvoiceTool);
  RegisterTool(server, SearchInvoicesTool);
  RegisterTool(server, CreateInvoiceTool);
  RegisterTool(server, UpdateInvoiceTool);
  RegisterTool(server, DeleteInvoiceTool);

  // Accounts
  RegisterTool(server, CreateAccountTool);
  RegisterTool(server, GetAccountTool);
  RegisterTool(server, UpdateAccountTool);
  RegisterTool(server, SearchAccountsTool);

  // Items
  RegisterTool(server, ReadItemTool);
  RegisterTool(server, SearchItemsTool);
  RegisterTool(server, CreateItemTool);
  RegisterTool(server, UpdateItemTool);
  RegisterTool(server, DeleteItemTool);

  // Vendors
  RegisterTool(server, CreateVendorTool);
  RegisterTool(server, UpdateVendorTool);
  RegisterTool(server, DeleteVendorTool);
  RegisterTool(server, GetVendorTool);
  RegisterTool(server, SearchVendorsTool);

  // Employees
  RegisterTool(server, CreateEmployeeTool);
  RegisterTool(server, GetEmployeeTool);
  RegisterTool(server, UpdateEmployeeTool);
  RegisterTool(server, DeleteEmployeeTool);
  RegisterTool(server, SearchEmployeesTool);

  // Journal Entries
  RegisterTool(server, CreateJournalEntryTool);
  RegisterTool(server, GetJournalEntryTool);
  RegisterTool(server, UpdateJournalEntryTool);
  RegisterTool(server, DeleteJournalEntryTool);
  RegisterTool(server, SearchJournalEntriesTool);

  // Bill Payments
  RegisterTool(server, CreateBillPaymentTool);
  RegisterTool(server, GetBillPaymentTool);
  RegisterTool(server, UpdateBillPaymentTool);
  RegisterTool(server, DeleteBillPaymentTool);
  RegisterTool(server, SearchBillPaymentsTool);

  // Purchases
  RegisterTool(server, CreatePurchaseTool);
  RegisterTool(server, GetPurchaseTool);
  RegisterTool(server, UpdatePurchaseTool);
  RegisterTool(server, DeletePurchaseTool);
  RegisterTool(server, SearchPurchasesTool);

  // Payments
  RegisterTool(server, CreatePaymentTool);
  RegisterTool(server, GetPaymentTool);
  RegisterTool(server, UpdatePaymentTool);
  RegisterTool(server, DeletePaymentTool);
  RegisterTool(server, SearchPaymentsTool);

  // Sales Receipts
  RegisterTool(server, CreateSalesReceiptTool);
  RegisterTool(server, GetSalesReceiptTool);
  RegisterTool(server, UpdateSalesReceiptTool);
  RegisterTool(server, DeleteSalesReceiptTool);
  RegisterTool(server, SearchSalesReceiptsTool);

  // Credit Memos
  RegisterTool(server, CreateCreditMemoTool);
  RegisterTool(server, GetCreditMemoTool);
  RegisterTool(server, UpdateCreditMemoTool);
  RegisterTool(server, DeleteCreditMemoTool);
  RegisterTool(server, SearchCreditMemosTool);

  // Refund Receipts
  RegisterTool(server, CreateRefundReceiptTool);
  RegisterTool(server, GetRefundReceiptTool);
  RegisterTool(server, UpdateRefundReceiptTool);
  RegisterTool(server, DeleteRefundReceiptTool);
  RegisterTool(server, SearchRefundReceiptsTool);

  // Purchase Orders
  RegisterTool(server, CreatePurchaseOrderTool);
  RegisterTool(server, GetPurchaseOrderTool);
  RegisterTool(server, UpdatePurchaseOrderTool);
  RegisterTool(server, DeletePurchaseOrderTool);
  RegisterTool(server, SearchPurchaseOrdersTool);

  // Vendor Credits
  RegisterTool(server, CreateVendorCreditTool);
  RegisterTool(server, GetVendorCreditTool);
  RegisterTool(server, UpdateVendorCreditTool);
  RegisterTool(server, DeleteVendorCreditTool);
  RegisterTool(server, SearchVendorCreditsTool);

  // Deposits
  RegisterTool(server, CreateDepositTool);
  RegisterTool(server, GetDepositTool);
  RegisterTool(server, UpdateDepositTool);
  RegisterTool(server, DeleteDepositTool);
  RegisterTool(server, SearchDepositsTool);

  // Transfers
  RegisterTool(server, CreateTransferTool);
  RegisterTool(server, GetTransferTool);
  RegisterTool(server, UpdateTransferTool);
  RegisterTool(server, DeleteTransferTool);
  RegisterTool(server, SearchTransfersTool);

  // Time Activities
  RegisterTool(server, CreateTimeActivityTool);
  RegisterTool(server, GetTimeActivityTool);
  RegisterTool(server, UpdateTimeActivityTool);
  RegisterTool(server, DeleteTimeActivityTool);
  RegisterTool(server, SearchTimeActivitiesTool);

  // Classes
  RegisterTool(server, CreateClassTool);
  RegisterTool(server, GetClassTool);
  RegisterTool(server, UpdateClassTool);
  RegisterTool(server, SearchClassesTool);

  // Departments
  RegisterTool(server, CreateDepartmentTool);
  RegisterTool(server, GetDepartmentTool);
  RegisterTool(server, UpdateDepartmentTool);
  RegisterTool(server, SearchDepartmentsTool);

  // Terms
  RegisterTool(server, CreateTermTool);
  RegisterTool(server, GetTermTool);
  RegisterTool(server, UpdateTermTool);
  RegisterTool(server, SearchTermsTool);

  // Payment Methods
  RegisterTool(server, CreatePaymentMethodTool);
  RegisterTool(server, GetPaymentMethodTool);
  RegisterTool(server, UpdatePaymentMethodTool);
  RegisterTool(server, SearchPaymentMethodsTool);

  // Tax Codes
  RegisterTool(server, GetTaxCodeTool);
  RegisterTool(server, SearchTaxCodesTool);

  // Tax Rates
  RegisterTool(server, GetTaxRateTool);
  RegisterTool(server, SearchTaxRatesTool);

  // Tax Agencies
  RegisterTool(server, GetTaxAgencyTool);
  RegisterTool(server, SearchTaxAgenciesTool);

  // Company Info
  RegisterTool(server, GetCompanyInfoTool);
  RegisterTool(server, UpdateCompanyInfoTool);

  // Attachables
  RegisterTool(server, CreateAttachableTool);
  RegisterTool(server, GetAttachableTool);
  RegisterTool(server, UpdateAttachableTool);
  RegisterTool(server, DeleteAttachableTool);
  RegisterTool(server, SearchAttachablesTool);

  // Financial Reports
  RegisterTool(server, GetBalanceSheetTool);
  RegisterTool(server, GetProfitAndLossTool);
  RegisterTool(server, GetCashFlowTool);
  RegisterTool(server, GetTrialBalanceTool);
  RegisterTool(server, GetGeneralLedgerTool);

  // Sales/AR Reports
  RegisterTool(server, GetCustomerSalesTool);
  RegisterTool(server, GetAgedReceivablesTool);
  RegisterTool(server, GetCustomerBalanceTool);

  // Expense/AP Reports
  RegisterTool(server, GetAgedPayablesTool);
  RegisterTool(server, GetVendorExpensesTool);
  RegisterTool(server, GetVendorBalanceTool);
}

async function startStdioTransport() {
  const server = QuickbooksMCPServer.GetServer();
  registerAllTools(server);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

async function startHttpTransport() {
  const port = parseInt(process.env.PORT || "8000", 10);

  const httpServer = http.createServer(async (req, res) => {
    // Extract Bearer token from Authorization header
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

    // Run MCP handling inside AsyncLocalStorage context so tool handlers
    // can access the per-request access token
    authStorage.run({ accessToken: token }, async () => {
      try {
        const url = new URL(req.url || "/", `http://localhost:${port}`);

        if (url.pathname === "/health") {
          res.writeHead(200, { "Content-Type": "text/plain" });
          res.end("ok");
          return;
        }

        if (url.pathname !== "/mcp") {
          res.writeHead(404);
          res.end();
          return;
        }

        if (req.method === "POST") {
          // Stateless mode: new server + transport per request
          const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: undefined,
          });
          const server = createMcpServer();
          registerAllTools(server);
          await server.connect(transport);

          // Parse request body
          const body = await new Promise<string>((resolve) => {
            let data = "";
            req.on("data", (chunk: Buffer) => { data += chunk.toString(); });
            req.on("end", () => resolve(data));
          });

          await transport.handleRequest(req, res, JSON.parse(body));
        } else if (req.method === "GET") {
          // SSE not supported in stateless mode
          res.writeHead(405, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "SSE not supported in stateless mode" }));
        } else if (req.method === "DELETE") {
          // Session termination — no-op in stateless mode
          res.writeHead(200);
          res.end();
        } else {
          res.writeHead(405);
          res.end();
        }
      } catch (error) {
        console.error("Error handling MCP request:", error);
        if (!res.headersSent) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Internal server error" }));
        }
      }
    });
  });

  httpServer.listen(port, () => {
    console.log(`QuickBooks MCP server listening on port ${port} (streamable-http)`);
  });
}

const main = async () => {
  const transportMode = process.env.MCP_TRANSPORT || "stdio";

  if (transportMode === "streamable-http") {
    await startHttpTransport();
  } else {
    await startStdioTransport();
  }
};

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
