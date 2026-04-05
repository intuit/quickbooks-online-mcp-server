// src/catalog/action-catalog.ts
import { ActionEntry } from "./types.js";
import { isWriteOperation } from "../config.js";

export const ACTION_CATALOG: ActionEntry[] = [
  // ── Customer ──────────────────────────────────────────────
  {
    id: "create_customer",
    entity: "customer",
    operation: "create",
    description:
      "Create a new customer in QuickBooks. At minimum requires DisplayName. Can include GivenName, FamilyName, CompanyName, PrimaryEmailAddr, PrimaryPhone, BillAddr, ShipAddr.",
    parameterHints: {
      data: "Customer object. Required: { DisplayName }. Optional: GivenName, FamilyName, CompanyName, PrimaryEmailAddr: { Address }, PrimaryPhone: { FreeFormNumber }, BillAddr: { Line1, City, CountrySubDivisionCode, PostalCode }",
    },
  },
  {
    id: "get_customer",
    entity: "customer",
    operation: "get",
    description:
      "Fetch a single customer by their QuickBooks ID. Returns the full Customer entity including SyncToken needed for updates.",
    parameterHints: { id: "The QuickBooks Customer ID (string)" },
  },
  {
    id: "update_customer",
    entity: "customer",
    operation: "update",
    description:
      "Update an existing customer. Requires Id and current SyncToken (fetch the customer first to get these). Sparse update — only include fields you want to change.",
    parameterHints: {
      data: "Customer object. Required: { Id, SyncToken }. Include only fields to change.",
    },
  },
  {
    id: "delete_customer",
    entity: "customer",
    operation: "delete",
    description:
      "Soft-delete a customer by setting Active=false. The customer remains in QuickBooks but is hidden from active lists. Requires the customer ID.",
    parameterHints: { id: "The QuickBooks Customer ID to deactivate" },
  },
  {
    id: "search_customers",
    entity: "customer",
    operation: "search",
    description:
      "Search customers by criteria. Filterable fields: Id, DisplayName, GivenName, FamilyName, CompanyName, PrimaryEmailAddr, PrimaryPhone, Balance, Active, MetaData.CreateTime, MetaData.LastUpdatedTime. Supports operators: =, <, >, <=, >=, LIKE, IN.",
    parameterHints: {
      criteria: "Array of { field, value, operator? } objects, or a simple { key: value } object. Use LIKE with % for partial matches.",
      limit: "Max results (number)",
      offset: "Skip N results (number)",
      asc: "Sort ascending by field name",
      desc: "Sort descending by field name",
    },
  },

  // ── Invoice ───────────────────────────────────────────────
  {
    id: "create_invoice",
    entity: "invoice",
    operation: "create",
    description:
      "Create an invoice. Requires a CustomerRef and at least one Line item with SalesItemLineDetail. Search for customer and item IDs first.",
    parameterHints: {
      data: "Invoice object. Required: { CustomerRef: { value: customerId }, Line: [{ DetailType: 'SalesItemLineDetail', Amount, SalesItemLineDetail: { ItemRef: { value: itemId }, Qty, UnitPrice } }] }. Optional: DocNumber, TxnDate (YYYY-MM-DD), DueDate.",
    },
  },
  {
    id: "get_invoice",
    entity: "invoice",
    operation: "get",
    description:
      "Fetch a single invoice by its QuickBooks ID. Returns the full Invoice entity including line items, totals, and SyncToken.",
    parameterHints: { id: "The QuickBooks Invoice ID (string)" },
  },
  {
    id: "update_invoice",
    entity: "invoice",
    operation: "update",
    description:
      "Update an existing invoice. Requires Id and current SyncToken. Sparse update supported.",
    parameterHints: {
      data: "Invoice object. Required: { Id, SyncToken }. Include only fields to change.",
    },
  },
  {
    id: "search_invoices",
    entity: "invoice",
    operation: "search",
    description:
      "Search invoices. Filterable: Id, DocNumber, TxnDate, DueDate, CustomerRef, Balance, TotalAmt, MetaData.CreateTime, MetaData.LastUpdatedTime. Supports =, <, >, <=, >=, LIKE, IN.",
    parameterHints: {
      criteria: "Array of { field, value, operator? } or simple { key: value }",
      limit: "Max results",
      offset: "Skip N results",
    },
  },

  // ── Estimate ──────────────────────────────────────────────
  {
    id: "create_estimate",
    entity: "estimate",
    operation: "create",
    description:
      "Create an estimate/quote. Similar structure to invoices — requires CustomerRef and Line items.",
    parameterHints: {
      data: "Estimate object. Required: { CustomerRef: { value: customerId }, Line: [...] }",
    },
  },
  {
    id: "get_estimate",
    entity: "estimate",
    operation: "get",
    description: "Fetch a single estimate by its QuickBooks ID.",
    parameterHints: { id: "The QuickBooks Estimate ID (string)" },
  },
  {
    id: "update_estimate",
    entity: "estimate",
    operation: "update",
    description: "Update an existing estimate. Requires Id and SyncToken.",
    parameterHints: {
      data: "Estimate object. Required: { Id, SyncToken }. Include only changed fields.",
    },
  },
  {
    id: "delete_estimate",
    entity: "estimate",
    operation: "delete",
    description: "Permanently delete an estimate. This is a hard delete — cannot be undone.",
    parameterHints: { id: "The QuickBooks Estimate ID to delete" },
  },
  {
    id: "search_estimates",
    entity: "estimate",
    operation: "search",
    description:
      "Search estimates. Filterable: Id, DocNumber, TxnDate, CustomerRef, TotalAmt, ExpirationDate, MetaData.CreateTime, MetaData.LastUpdatedTime.",
    parameterHints: {
      criteria: "Array of { field, value, operator? } or simple { key: value }",
    },
  },

  // ── Bill ──────────────────────────────────────────────────
  {
    id: "create_bill",
    entity: "bill",
    operation: "create",
    description:
      "Create a bill (payable). Requires VendorRef and Line items. Search for vendor IDs first.",
    parameterHints: {
      data: "Bill object. Required: { VendorRef: { value: vendorId }, Line: [...] }",
    },
  },
  {
    id: "get_bill",
    entity: "bill",
    operation: "get",
    description: "Fetch a single bill by its QuickBooks ID.",
    parameterHints: { id: "The QuickBooks Bill ID (string)" },
  },
  {
    id: "update_bill",
    entity: "bill",
    operation: "update",
    description: "Update an existing bill. Requires Id and SyncToken.",
    parameterHints: {
      data: "Bill object. Required: { Id, SyncToken }. Include only changed fields.",
    },
  },
  {
    id: "delete_bill",
    entity: "bill",
    operation: "delete",
    description: "Permanently delete a bill. Hard delete — cannot be undone.",
    parameterHints: { id: "The QuickBooks Bill ID to delete" },
  },
  {
    id: "search_bills",
    entity: "bill",
    operation: "search",
    description:
      "Search bills. Filterable: Id, DocNumber, TxnDate, DueDate, VendorRef, Balance, TotalAmt, MetaData.CreateTime, MetaData.LastUpdatedTime.",
    parameterHints: {
      criteria: "Array of { field, value, operator? } or simple { key: value }",
    },
  },

  // ── Account (Chart of Accounts) ───────────────────────────
  {
    id: "create_account",
    entity: "account",
    operation: "create",
    description:
      "Create a chart-of-accounts entry. Requires Name and AccountType (e.g. 'Bank', 'Expense', 'Income', 'Other Current Asset').",
    parameterHints: {
      data: "Account object. Required: { Name, AccountType }. Optional: AccountSubType, Description.",
    },
  },
  {
    id: "update_account",
    entity: "account",
    operation: "update",
    description: "Update a chart-of-accounts entry. Requires Id and SyncToken.",
    parameterHints: {
      data: "Account object. Required: { Id, SyncToken }. Include only changed fields.",
    },
  },
  {
    id: "search_accounts",
    entity: "account",
    operation: "search",
    description:
      "Search chart-of-accounts entries. Filterable: Id, Name, AccountType, Classification, Active, CurrentBalance, MetaData.CreateTime, MetaData.LastUpdatedTime.",
    parameterHints: {
      criteria: "Array of { field, value, operator? } or simple { key: value }",
    },
  },

  // ── Item ──────────────────────────────────────────────────
  {
    id: "create_item",
    entity: "item",
    operation: "create",
    description:
      "Create a product or service item. Requires Name and Type ('Inventory', 'Service', 'NonInventory').",
    parameterHints: {
      data: "Item object. Required: { Name, Type }. Optional: Sku, UnitPrice, IncomeAccountRef, ExpenseAccountRef, QtyOnHand, InvStartDate.",
    },
  },
  {
    id: "get_item",
    entity: "item",
    operation: "get",
    description: "Fetch a single item by its QuickBooks ID.",
    parameterHints: { id: "The QuickBooks Item ID (string)" },
  },
  {
    id: "update_item",
    entity: "item",
    operation: "update",
    description: "Update an existing item. Requires Id and SyncToken.",
    parameterHints: {
      data: "Item object. Required: { Id, SyncToken }. Include only changed fields.",
    },
  },
  {
    id: "search_items",
    entity: "item",
    operation: "search",
    description:
      "Search items (products/services). Filterable: Id, Name, Active, Type, Sku, MetaData.CreateTime, MetaData.LastUpdatedTime.",
    parameterHints: {
      criteria: "Array of { field, value, operator? } or simple { key: value }",
    },
  },

  // ── Vendor ────────────────────────────────────────────────
  {
    id: "create_vendor",
    entity: "vendor",
    operation: "create",
    description:
      "Create a vendor (supplier). Requires DisplayName at minimum.",
    parameterHints: {
      data: "Vendor object. Required: { DisplayName }. Optional: GivenName, FamilyName, CompanyName, PrimaryEmailAddr, PrimaryPhone.",
    },
  },
  {
    id: "get_vendor",
    entity: "vendor",
    operation: "get",
    description: "Fetch a single vendor by their QuickBooks ID.",
    parameterHints: { id: "The QuickBooks Vendor ID (string)" },
  },
  {
    id: "update_vendor",
    entity: "vendor",
    operation: "update",
    description: "Update an existing vendor. Requires Id and SyncToken.",
    parameterHints: {
      data: "Vendor object. Required: { Id, SyncToken }. Include only changed fields.",
    },
  },
  {
    id: "delete_vendor",
    entity: "vendor",
    operation: "delete",
    description:
      "Soft-delete a vendor by setting Active=false. The vendor remains in QuickBooks but is hidden.",
    parameterHints: { id: "The QuickBooks Vendor ID to deactivate" },
  },
  {
    id: "search_vendors",
    entity: "vendor",
    operation: "search",
    description:
      "Search vendors. Filterable: Id, DisplayName, GivenName, FamilyName, CompanyName, Active, Balance, MetaData.CreateTime, MetaData.LastUpdatedTime.",
    parameterHints: {
      criteria: "Array of { field, value, operator? } or simple { key: value }",
    },
  },

  // ── Employee ──────────────────────────────────────────────
  {
    id: "create_employee",
    entity: "employee",
    operation: "create",
    description:
      "Create an employee. Requires GivenName and FamilyName at minimum.",
    parameterHints: {
      data: "Employee object. Required: { GivenName, FamilyName }. Optional: DisplayName, PrimaryPhone, PrimaryEmailAddr, SSN.",
    },
  },
  {
    id: "get_employee",
    entity: "employee",
    operation: "get",
    description: "Fetch a single employee by their QuickBooks ID.",
    parameterHints: { id: "The QuickBooks Employee ID (string)" },
  },
  {
    id: "update_employee",
    entity: "employee",
    operation: "update",
    description: "Update an existing employee. Requires Id and SyncToken.",
    parameterHints: {
      data: "Employee object. Required: { Id, SyncToken }. Include only changed fields.",
    },
  },
  {
    id: "search_employees",
    entity: "employee",
    operation: "search",
    description:
      "Search employees. Filterable: Id, DisplayName, GivenName, FamilyName, Active, MetaData.CreateTime, MetaData.LastUpdatedTime.",
    parameterHints: {
      criteria: "Array of { field, value, operator? } or simple { key: value }",
    },
  },

  // ── Journal Entry ─────────────────────────────────────────
  {
    id: "create_journal_entry",
    entity: "journal_entry",
    operation: "create",
    description:
      "Create a journal entry. Requires Line items with JournalEntryLineDetail including PostingType (Debit/Credit) and AccountRef.",
    parameterHints: {
      data: "JournalEntry object. Required: { Line: [{ DetailType: 'JournalEntryLineDetail', Amount, JournalEntryLineDetail: { PostingType: 'Debit'|'Credit', AccountRef: { value: accountId } } }] }",
    },
  },
  {
    id: "get_journal_entry",
    entity: "journal_entry",
    operation: "get",
    description: "Fetch a single journal entry by its QuickBooks ID.",
    parameterHints: { id: "The QuickBooks JournalEntry ID (string)" },
  },
  {
    id: "update_journal_entry",
    entity: "journal_entry",
    operation: "update",
    description: "Update an existing journal entry. Requires Id and SyncToken.",
    parameterHints: {
      data: "JournalEntry object. Required: { Id, SyncToken }. Include only changed fields.",
    },
  },
  {
    id: "delete_journal_entry",
    entity: "journal_entry",
    operation: "delete",
    description: "Permanently delete a journal entry. Hard delete — cannot be undone.",
    parameterHints: { id: "The QuickBooks JournalEntry ID to delete" },
  },
  {
    id: "search_journal_entries",
    entity: "journal_entry",
    operation: "search",
    description:
      "Search journal entries. Filterable: Id, DocNumber, TxnDate, MetaData.CreateTime, MetaData.LastUpdatedTime.",
    parameterHints: {
      criteria: "Array of { field, value, operator? } or simple { key: value }",
    },
  },

  // ── Bill Payment ──────────────────────────────────────────
  {
    id: "create_bill_payment",
    entity: "bill_payment",
    operation: "create",
    description:
      "Create a bill payment. Links a payment to one or more bills. Requires VendorRef, TotalAmt, and Line items referencing bill IDs.",
    parameterHints: {
      data: "BillPayment object. Required: { VendorRef: { value: vendorId }, TotalAmt, PayType: 'Check'|'CreditCard', Line: [{ Amount, LinkedTxn: [{ TxnId: billId, TxnType: 'Bill' }] }] }",
    },
  },
  {
    id: "get_bill_payment",
    entity: "bill_payment",
    operation: "get",
    description: "Fetch a single bill payment by its QuickBooks ID.",
    parameterHints: { id: "The QuickBooks BillPayment ID (string)" },
  },
  {
    id: "update_bill_payment",
    entity: "bill_payment",
    operation: "update",
    description: "Update an existing bill payment. Requires Id and SyncToken.",
    parameterHints: {
      data: "BillPayment object. Required: { Id, SyncToken }. Include only changed fields.",
    },
  },
  {
    id: "delete_bill_payment",
    entity: "bill_payment",
    operation: "delete",
    description: "Permanently delete a bill payment. Hard delete — cannot be undone.",
    parameterHints: { id: "The QuickBooks BillPayment ID to delete" },
  },
  {
    id: "search_bill_payments",
    entity: "bill_payment",
    operation: "search",
    description:
      "Search bill payments. Filterable: Id, VendorRef, TotalAmt, PayType, TxnDate, MetaData.CreateTime, MetaData.LastUpdatedTime.",
    parameterHints: {
      criteria: "Array of { field, value, operator? } or simple { key: value }",
    },
  },

  // ── Purchase ──────────────────────────────────────────────
  {
    id: "create_purchase",
    entity: "purchase",
    operation: "create",
    description:
      "Create a purchase (expense transaction). Requires PaymentType and Line items with AccountBasedExpenseLineDetail or ItemBasedExpenseLineDetail.",
    parameterHints: {
      data: "Purchase object. Required: { PaymentType: 'Cash'|'Check'|'CreditCard', Line: [...], AccountRef: { value: accountId } }",
    },
  },
  {
    id: "get_purchase",
    entity: "purchase",
    operation: "get",
    description: "Fetch a single purchase by its QuickBooks ID.",
    parameterHints: { id: "The QuickBooks Purchase ID (string)" },
  },
  {
    id: "update_purchase",
    entity: "purchase",
    operation: "update",
    description: "Update an existing purchase. Requires Id and SyncToken.",
    parameterHints: {
      data: "Purchase object. Required: { Id, SyncToken }. Include only changed fields.",
    },
  },
  {
    id: "delete_purchase",
    entity: "purchase",
    operation: "delete",
    description: "Permanently delete a purchase. Hard delete — cannot be undone.",
    parameterHints: { id: "The QuickBooks Purchase ID to delete" },
  },
  {
    id: "search_purchases",
    entity: "purchase",
    operation: "search",
    description:
      "Search purchases. Filterable: Id, PaymentType, TotalAmt, AccountRef, TxnDate, MetaData.CreateTime, MetaData.LastUpdatedTime.",
    parameterHints: {
      criteria: "Array of { field, value, operator? } or simple { key: value }",
    },
  },

  // ── Reports ───────────────────────────────────────────────
  {
    id: "report_profit_and_loss",
    entity: "report",
    operation: "report",
    description: "Profit and Loss (Income Statement) report. Shows revenue, expenses, and net income for a date range.",
    parameterHints: {
      options: "{ start_date?: 'YYYY-MM-DD', end_date?: 'YYYY-MM-DD', accounting_method?: 'Cash'|'Accrual', summarize_column_by?: 'Month'|'Week'|'Days'|'Quarter'|'Year'|'Total' }",
    },
    reportMethod: "reportProfitAndLoss",
  },
  {
    id: "report_profit_and_loss_detail",
    entity: "report",
    operation: "report",
    description: "Detailed Profit and Loss report with individual transaction line items.",
    parameterHints: {
      options: "{ start_date?: 'YYYY-MM-DD', end_date?: 'YYYY-MM-DD', accounting_method?: 'Cash'|'Accrual' }",
    },
    reportMethod: "reportProfitAndLossDetail",
  },
  {
    id: "report_balance_sheet",
    entity: "report",
    operation: "report",
    description: "Balance Sheet report. Shows assets, liabilities, and equity as of a specific date.",
    parameterHints: {
      options: "{ start_date?: 'YYYY-MM-DD', end_date?: 'YYYY-MM-DD', accounting_method?: 'Cash'|'Accrual', summarize_column_by?: 'Month'|'Quarter'|'Year'|'Total' }",
    },
    reportMethod: "reportBalanceSheet",
  },
  {
    id: "report_cash_flow",
    entity: "report",
    operation: "report",
    description: "Statement of Cash Flows. Shows operating, investing, and financing cash activities.",
    parameterHints: {
      options: "{ start_date?: 'YYYY-MM-DD', end_date?: 'YYYY-MM-DD', summarize_column_by?: 'Month'|'Quarter'|'Year'|'Total' }",
    },
    reportMethod: "reportCashFlow",
  },
  {
    id: "report_trial_balance",
    entity: "report",
    operation: "report",
    description: "Trial Balance report. Lists all accounts with their debit and credit balances.",
    parameterHints: {
      options: "{ start_date?: 'YYYY-MM-DD', end_date?: 'YYYY-MM-DD', accounting_method?: 'Cash'|'Accrual' }",
    },
    reportMethod: "reportTrialBalance",
  },
  {
    id: "report_customer_sales",
    entity: "report",
    operation: "report",
    description: "Customer Sales report. Shows total sales broken down by customer.",
    parameterHints: {
      options: "{ start_date?: 'YYYY-MM-DD', end_date?: 'YYYY-MM-DD', summarize_column_by?: 'Month'|'Quarter'|'Year'|'Total' }",
    },
    reportMethod: "reportCustomerSales",
  },
  {
    id: "report_item_sales",
    entity: "report",
    operation: "report",
    description: "Item Sales report. Shows total sales broken down by product/service item.",
    parameterHints: {
      options: "{ start_date?: 'YYYY-MM-DD', end_date?: 'YYYY-MM-DD', summarize_column_by?: 'Month'|'Quarter'|'Year'|'Total' }",
    },
    reportMethod: "reportItemSales",
  },
  {
    id: "report_customer_income",
    entity: "report",
    operation: "report",
    description: "Customer Income report. Shows income received from each customer.",
    parameterHints: {
      options: "{ start_date?: 'YYYY-MM-DD', end_date?: 'YYYY-MM-DD' }",
    },
    reportMethod: "reportCustomerIncome",
  },
  {
    id: "report_customer_balance",
    entity: "report",
    operation: "report",
    description: "Customer Balance Summary. Shows outstanding balances owed by each customer.",
    parameterHints: {
      options: "{ start_date?: 'YYYY-MM-DD', end_date?: 'YYYY-MM-DD' }",
    },
    reportMethod: "reportCustomerBalance",
  },
  {
    id: "report_customer_balance_detail",
    entity: "report",
    operation: "report",
    description: "Customer Balance Detail. Shows individual open transactions per customer.",
    parameterHints: {
      options: "{ start_date?: 'YYYY-MM-DD', end_date?: 'YYYY-MM-DD' }",
    },
    reportMethod: "reportCustomerBalanceDetail",
  },
  {
    id: "report_aged_receivables",
    entity: "report",
    operation: "report",
    description: "Aged Receivables Summary. Shows money owed to you grouped by aging period (Current, 1-30, 31-60, 61-90, 91+ days).",
    parameterHints: {
      options: "{ report_date?: 'YYYY-MM-DD', aging_period?: number }",
    },
    reportMethod: "reportAgedReceivables",
  },
  {
    id: "report_aged_receivables_detail",
    entity: "report",
    operation: "report",
    description: "Aged Receivables Detail. Shows individual overdue invoices grouped by aging period.",
    parameterHints: {
      options: "{ report_date?: 'YYYY-MM-DD', aging_period?: number }",
    },
    reportMethod: "reportAgedReceivableDetail",
  },
  {
    id: "report_vendor_balance",
    entity: "report",
    operation: "report",
    description: "Vendor Balance Summary. Shows outstanding balances owed to each vendor.",
    parameterHints: {
      options: "{ start_date?: 'YYYY-MM-DD', end_date?: 'YYYY-MM-DD' }",
    },
    reportMethod: "reportVendorBalance",
  },
  {
    id: "report_vendor_balance_detail",
    entity: "report",
    operation: "report",
    description: "Vendor Balance Detail. Shows individual open bills per vendor.",
    parameterHints: {
      options: "{ start_date?: 'YYYY-MM-DD', end_date?: 'YYYY-MM-DD' }",
    },
    reportMethod: "reportVendorBalanceDetail",
  },
  {
    id: "report_aged_payables",
    entity: "report",
    operation: "report",
    description: "Aged Payables Summary. Shows money you owe grouped by aging period (Current, 1-30, 31-60, 61-90, 91+ days).",
    parameterHints: {
      options: "{ report_date?: 'YYYY-MM-DD', aging_period?: number }",
    },
    reportMethod: "reportAgedPayables",
  },
  {
    id: "report_aged_payables_detail",
    entity: "report",
    operation: "report",
    description: "Aged Payables Detail. Shows individual overdue bills grouped by aging period.",
    parameterHints: {
      options: "{ report_date?: 'YYYY-MM-DD', aging_period?: number }",
    },
    reportMethod: "reportAgedPayableDetail",
  },
  {
    id: "report_vendor_expenses",
    entity: "report",
    operation: "report",
    description: "Vendor Expenses report. Shows total expenses broken down by vendor.",
    parameterHints: {
      options: "{ start_date?: 'YYYY-MM-DD', end_date?: 'YYYY-MM-DD', summarize_column_by?: 'Month'|'Quarter'|'Year'|'Total' }",
    },
    reportMethod: "reportVendorExpenses",
  },
  {
    id: "report_transaction_list",
    entity: "report",
    operation: "report",
    description: "Transaction List report. Shows all transactions for a date range.",
    parameterHints: {
      options: "{ start_date?: 'YYYY-MM-DD', end_date?: 'YYYY-MM-DD', columns?: 'tx_date,txn_type,name,memo,amount' }",
    },
    reportMethod: "reportTransactionList",
  },
  {
    id: "report_transaction_list_with_splits",
    entity: "report",
    operation: "report",
    description: "Transaction List with Splits. Shows all transactions with their line-item splits for a date range.",
    parameterHints: {
      options: "{ start_date?: 'YYYY-MM-DD', end_date?: 'YYYY-MM-DD' }",
    },
    reportMethod: "reportTransactionListWithSplits",
  },
  {
    id: "report_transaction_list_by_customer",
    entity: "report",
    operation: "report",
    description: "Transaction List by Customer. Shows all transactions grouped by customer.",
    parameterHints: {
      options: "{ start_date?: 'YYYY-MM-DD', end_date?: 'YYYY-MM-DD' }",
    },
    reportMethod: "reportTransactionListByCustomer",
  },
  {
    id: "report_transaction_list_by_vendor",
    entity: "report",
    operation: "report",
    description: "Transaction List by Vendor. Shows all transactions grouped by vendor.",
    parameterHints: {
      options: "{ start_date?: 'YYYY-MM-DD', end_date?: 'YYYY-MM-DD' }",
    },
    reportMethod: "reportTransactionListByVendor",
  },
  {
    id: "report_general_ledger",
    entity: "report",
    operation: "report",
    description: "General Ledger Detail. Shows all transactions posted to each account with running balances.",
    parameterHints: {
      options: "{ start_date?: 'YYYY-MM-DD', end_date?: 'YYYY-MM-DD', accounting_method?: 'Cash'|'Accrual' }",
    },
    reportMethod: "reportGeneralLedgerDetail",
  },
  {
    id: "report_inventory_valuation",
    entity: "report",
    operation: "report",
    description: "Inventory Valuation Summary. Shows quantity on hand, average cost, and total value per inventory item.",
    parameterHints: {
      options: "{ report_date?: 'YYYY-MM-DD' }",
    },
    reportMethod: "reportInventoryValuationSummary",
  },
  {
    id: "report_tax_summary",
    entity: "report",
    operation: "report",
    description: "Tax Summary report. Shows taxable and non-taxable sales and purchases with tax amounts.",
    parameterHints: {
      options: "{ start_date?: 'YYYY-MM-DD', end_date?: 'YYYY-MM-DD' }",
    },
    reportMethod: "reportTaxSummary",
  },
  {
    id: "report_department_sales",
    entity: "report",
    operation: "report",
    description: "Department Sales report. Shows sales broken down by department/location.",
    parameterHints: {
      options: "{ start_date?: 'YYYY-MM-DD', end_date?: 'YYYY-MM-DD', summarize_column_by?: 'Month'|'Quarter'|'Year'|'Total' }",
    },
    reportMethod: "reportDepartmentSales",
  },
  {
    id: "report_class_sales",
    entity: "report",
    operation: "report",
    description: "Class Sales report. Shows sales broken down by class.",
    parameterHints: {
      options: "{ start_date?: 'YYYY-MM-DD', end_date?: 'YYYY-MM-DD', summarize_column_by?: 'Month'|'Quarter'|'Year'|'Total' }",
    },
    reportMethod: "reportClassSales",
  },
  {
    id: "report_account_list",
    entity: "report",
    operation: "report",
    description: "Account List Detail. Shows all accounts with their types, detail types, descriptions, and balances.",
    parameterHints: {
      options: "{}",
    },
    reportMethod: "reportAccountListDetail",
  },
  {
    id: "report_journal",
    entity: "report",
    operation: "report",
    description: "Journal Report. Shows all journal entries with debits and credits for a date range.",
    parameterHints: {
      options: "{ start_date?: 'YYYY-MM-DD', end_date?: 'YYYY-MM-DD' }",
    },
    reportMethod: "reportJournalReport",
  },
  {
    id: "report_trial_balance_fr",
    entity: "report",
    operation: "report",
    description: "Trial Balance (France). French-localized trial balance report.",
    parameterHints: {
      options: "{ start_date?: 'YYYY-MM-DD', end_date?: 'YYYY-MM-DD' }",
    },
    reportMethod: "reportTrialBalanceFR",
  },
];

/** Simple keyword search over the action catalog. */
export function searchCatalog(intent: string, limit = 10, readOnly = false): ActionEntry[] {
  const candidates = readOnly
    ? ACTION_CATALOG.filter((a) => !isWriteOperation(a.operation))
    : ACTION_CATALOG;
  const terms = intent.toLowerCase().split(/\s+/);
  const scored = candidates.map((action) => {
    const text = `${action.id} ${action.entity} ${action.operation} ${action.description}`.toLowerCase();
    const score = terms.reduce((sum, term) => sum + (text.includes(term) ? 1 : 0), 0);
    return { action, score };
  });
  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.action);
}
