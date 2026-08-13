// GENERATED FILE — DO NOT EDIT BY HAND.
// Regenerate with: node scripts/generate-vendor-tool-registry.mjs
//
// Every tool vendored from intuit/quickbooks-online-mcp-server, as data. This
// file states only what exists. Risk classification and which tools are actually
// exposed are decided in tool-allowlist.ts, so regenerating this file can never
// silently change a tool's risk or expose something new without review.
//
// 141 tools.

import type { z } from "zod";
import type { ToolDefinition } from "../vendor/types/tool-definition.js";

import { CreateAccountTool } from "../vendor/tools/create-account.tool.js";
import { CreateAttachableTool } from "../vendor/tools/create-attachable.tool.js";
import { CreateBillPaymentTool } from "../vendor/tools/create-bill-payment.tool.js";
import { CreateBillTool } from "../vendor/tools/create-bill.tool.js";
import { CreateClassTool } from "../vendor/tools/create-class.tool.js";
import { CreateCreditMemoTool } from "../vendor/tools/create-credit-memo.tool.js";
import { CreateCustomerTool } from "../vendor/tools/create-customer.tool.js";
import { CreateDepartmentTool } from "../vendor/tools/create-department.tool.js";
import { CreateDepositTool } from "../vendor/tools/create-deposit.tool.js";
import { CreateEmployeeTool } from "../vendor/tools/create-employee.tool.js";
import { CreateEstimateTool } from "../vendor/tools/create-estimate.tool.js";
import { CreateInvoiceTool } from "../vendor/tools/create-invoice.tool.js";
import { CreateItemTool } from "../vendor/tools/create-item.tool.js";
import { CreateJournalEntryTool } from "../vendor/tools/create-journal-entry.tool.js";
import { CreatePaymentMethodTool } from "../vendor/tools/create-payment-method.tool.js";
import { CreatePaymentTool } from "../vendor/tools/create-payment.tool.js";
import { CreatePurchaseOrderTool } from "../vendor/tools/create-purchase-order.tool.js";
import { CreatePurchaseTool } from "../vendor/tools/create-purchase.tool.js";
import { CreateRefundReceiptTool } from "../vendor/tools/create-refund-receipt.tool.js";
import { CreateSalesReceiptTool } from "../vendor/tools/create-sales-receipt.tool.js";
import { CreateTermTool } from "../vendor/tools/create-term.tool.js";
import { CreateTimeActivityTool } from "../vendor/tools/create-time-activity.tool.js";
import { CreateTransferTool } from "../vendor/tools/create-transfer.tool.js";
import { CreateVendorCreditTool } from "../vendor/tools/create-vendor-credit.tool.js";
import { CreateVendorTool } from "../vendor/tools/create-vendor.tool.js";
import { DeleteAttachableTool } from "../vendor/tools/delete-attachable.tool.js";
import { DeleteBillPaymentTool } from "../vendor/tools/delete-bill-payment.tool.js";
import { DeleteBillTool } from "../vendor/tools/delete-bill.tool.js";
import { DeleteCreditMemoTool } from "../vendor/tools/delete-credit-memo.tool.js";
import { DeleteCustomerTool } from "../vendor/tools/delete-customer.tool.js";
import { DeleteDepositTool } from "../vendor/tools/delete-deposit.tool.js";
import { DeleteEmployeeTool } from "../vendor/tools/delete-employee.tool.js";
import { DeleteEstimateTool } from "../vendor/tools/delete-estimate.tool.js";
import { DeleteInvoiceTool } from "../vendor/tools/delete-invoice.tool.js";
import { DeleteItemTool } from "../vendor/tools/delete-item.tool.js";
import { DeleteJournalEntryTool } from "../vendor/tools/delete-journal-entry.tool.js";
import { DeletePaymentTool } from "../vendor/tools/delete-payment.tool.js";
import { DeletePurchaseOrderTool } from "../vendor/tools/delete-purchase-order.tool.js";
import { DeletePurchaseTool } from "../vendor/tools/delete-purchase.tool.js";
import { DeleteRefundReceiptTool } from "../vendor/tools/delete-refund-receipt.tool.js";
import { DeleteSalesReceiptTool } from "../vendor/tools/delete-sales-receipt.tool.js";
import { DeleteTimeActivityTool } from "../vendor/tools/delete-time-activity.tool.js";
import { DeleteTransferTool } from "../vendor/tools/delete-transfer.tool.js";
import { DeleteVendorCreditTool } from "../vendor/tools/delete-vendor-credit.tool.js";
import { DeleteVendorTool } from "../vendor/tools/delete-vendor.tool.js";
import { GetAccountTool } from "../vendor/tools/get-account.tool.js";
import { GetAgedPayablesTool } from "../vendor/tools/get-aged-payables.tool.js";
import { GetAgedReceivablesTool } from "../vendor/tools/get-aged-receivables.tool.js";
import { GetAttachableTool } from "../vendor/tools/get-attachable.tool.js";
import { GetBalanceSheetTool } from "../vendor/tools/get-balance-sheet.tool.js";
import { GetBillPaymentTool } from "../vendor/tools/get-bill-payment.tool.js";
import { GetBillTool } from "../vendor/tools/get-bill.tool.js";
import { GetCashFlowTool } from "../vendor/tools/get-cash-flow.tool.js";
import { GetClassTool } from "../vendor/tools/get-class.tool.js";
import { GetCompanyInfoTool } from "../vendor/tools/get-company-info.tool.js";
import { GetCreditMemoTool } from "../vendor/tools/get-credit-memo.tool.js";
import { GetCustomerBalanceTool } from "../vendor/tools/get-customer-balance.tool.js";
import { GetCustomerSalesTool } from "../vendor/tools/get-customer-sales.tool.js";
import { GetCustomerTool } from "../vendor/tools/get-customer.tool.js";
import { GetDepartmentTool } from "../vendor/tools/get-department.tool.js";
import { GetDepositTool } from "../vendor/tools/get-deposit.tool.js";
import { GetEmployeeTool } from "../vendor/tools/get-employee.tool.js";
import { GetEstimateTool } from "../vendor/tools/get-estimate.tool.js";
import { GetGeneralLedgerTool } from "../vendor/tools/get-general-ledger.tool.js";
import { GetInvoicePdfTool } from "../vendor/tools/get-invoice-pdf.tool.js";
import { GetJournalEntryTool } from "../vendor/tools/get-journal-entry.tool.js";
import { GetPaymentMethodTool } from "../vendor/tools/get-payment-method.tool.js";
import { GetPaymentTool } from "../vendor/tools/get-payment.tool.js";
import { GetProfitAndLossTool } from "../vendor/tools/get-profit-and-loss.tool.js";
import { GetPurchaseOrderTool } from "../vendor/tools/get-purchase-order.tool.js";
import { GetPurchaseTool } from "../vendor/tools/get-purchase.tool.js";
import { GetRefundReceiptTool } from "../vendor/tools/get-refund-receipt.tool.js";
import { GetSalesReceiptTool } from "../vendor/tools/get-sales-receipt.tool.js";
import { GetTaxAgencyTool } from "../vendor/tools/get-tax-agency.tool.js";
import { GetTaxCodeTool } from "../vendor/tools/get-tax-code.tool.js";
import { GetTaxRateTool } from "../vendor/tools/get-tax-rate.tool.js";
import { GetTermTool } from "../vendor/tools/get-term.tool.js";
import { GetTimeActivityTool } from "../vendor/tools/get-time-activity.tool.js";
import { GetTransferTool } from "../vendor/tools/get-transfer.tool.js";
import { GetTrialBalanceTool } from "../vendor/tools/get-trial-balance.tool.js";
import { GetVendorBalanceTool } from "../vendor/tools/get-vendor-balance.tool.js";
import { GetVendorCreditTool } from "../vendor/tools/get-vendor-credit.tool.js";
import { GetVendorExpensesTool } from "../vendor/tools/get-vendor-expenses.tool.js";
import { GetVendorTool } from "../vendor/tools/get-vendor.tool.js";
import { ReadInvoiceTool } from "../vendor/tools/read-invoice.tool.js";
import { ReadItemTool } from "../vendor/tools/read-item.tool.js";
import { SearchAccountsTool } from "../vendor/tools/search-accounts.tool.js";
import { SearchAttachablesTool } from "../vendor/tools/search-attachables.tool.js";
import { SearchBillPaymentsTool } from "../vendor/tools/search-bill-payments.tool.js";
import { SearchBillsTool } from "../vendor/tools/search-bills.tool.js";
import { SearchBudgetsTool } from "../vendor/tools/search-budgets.tool.js";
import { SearchClassesTool } from "../vendor/tools/search-classes.tool.js";
import { SearchCreditMemosTool } from "../vendor/tools/search-credit-memos.tool.js";
import { SearchCustomersTool } from "../vendor/tools/search-customers.tool.js";
import { SearchDepartmentsTool } from "../vendor/tools/search-departments.tool.js";
import { SearchDepositsTool } from "../vendor/tools/search-deposits.tool.js";
import { SearchEmployeesTool } from "../vendor/tools/search-employees.tool.js";
import { SearchEstimatesTool } from "../vendor/tools/search-estimates.tool.js";
import { SearchInvoicesTool } from "../vendor/tools/search-invoices.tool.js";
import { SearchItemsTool } from "../vendor/tools/search-items.tool.js";
import { SearchJournalEntriesTool } from "../vendor/tools/search-journal-entries.tool.js";
import { SearchPaymentMethodsTool } from "../vendor/tools/search-payment-methods.tool.js";
import { SearchPaymentsTool } from "../vendor/tools/search-payments.tool.js";
import { SearchPurchaseOrdersTool } from "../vendor/tools/search-purchase-orders.tool.js";
import { SearchPurchasesTool } from "../vendor/tools/search-purchases.tool.js";
import { SearchRefundReceiptsTool } from "../vendor/tools/search-refund-receipts.tool.js";
import { SearchSalesReceiptsTool } from "../vendor/tools/search-sales-receipts.tool.js";
import { SearchTaxAgenciesTool } from "../vendor/tools/search-tax-agencies.tool.js";
import { SearchTaxCodesTool } from "../vendor/tools/search-tax-codes.tool.js";
import { SearchTaxRatesTool } from "../vendor/tools/search-tax-rates.tool.js";
import { SearchTermsTool } from "../vendor/tools/search-terms.tool.js";
import { SearchTimeActivitiesTool } from "../vendor/tools/search-time-activities.tool.js";
import { SearchTransfersTool } from "../vendor/tools/search-transfers.tool.js";
import { SearchVendorCreditsTool } from "../vendor/tools/search-vendor-credits.tool.js";
import { SearchVendorsTool } from "../vendor/tools/search-vendors.tool.js";
import { UpdateAccountTool } from "../vendor/tools/update-account.tool.js";
import { UpdateAttachableTool } from "../vendor/tools/update-attachable.tool.js";
import { UpdateBillPaymentTool } from "../vendor/tools/update-bill-payment.tool.js";
import { UpdateBillTool } from "../vendor/tools/update-bill.tool.js";
import { UpdateClassTool } from "../vendor/tools/update-class.tool.js";
import { UpdateCompanyInfoTool } from "../vendor/tools/update-company-info.tool.js";
import { UpdateCreditMemoTool } from "../vendor/tools/update-credit-memo.tool.js";
import { UpdateCustomerTool } from "../vendor/tools/update-customer.tool.js";
import { UpdateDepartmentTool } from "../vendor/tools/update-department.tool.js";
import { UpdateDepositTool } from "../vendor/tools/update-deposit.tool.js";
import { UpdateEmployeeTool } from "../vendor/tools/update-employee.tool.js";
import { UpdateEstimateTool } from "../vendor/tools/update-estimate.tool.js";
import { UpdateInvoiceTool } from "../vendor/tools/update-invoice.tool.js";
import { UpdateItemTool } from "../vendor/tools/update-item.tool.js";
import { UpdateJournalEntryTool } from "../vendor/tools/update-journal-entry.tool.js";
import { UpdatePaymentMethodTool } from "../vendor/tools/update-payment-method.tool.js";
import { UpdatePaymentTool } from "../vendor/tools/update-payment.tool.js";
import { UpdatePurchaseOrderTool } from "../vendor/tools/update-purchase-order.tool.js";
import { UpdatePurchaseTool } from "../vendor/tools/update-purchase.tool.js";
import { UpdateRefundReceiptTool } from "../vendor/tools/update-refund-receipt.tool.js";
import { UpdateSalesReceiptTool } from "../vendor/tools/update-sales-receipt.tool.js";
import { UpdateTermTool } from "../vendor/tools/update-term.tool.js";
import { UpdateTimeActivityTool } from "../vendor/tools/update-time-activity.tool.js";
import { UpdateTransferTool } from "../vendor/tools/update-transfer.tool.js";
import { UpdateVendorCreditTool } from "../vendor/tools/update-vendor-credit.tool.js";
import { UpdateVendorTool } from "../vendor/tools/update-vendor.tool.js";

/** Each vendored tool is typed against its own schema; one list needs one type. */
export type AnyVendoredTool = ToolDefinition<z.ZodTypeAny>;

export interface VendoredToolEntry {
  /** The MCP tool name, read from the tool file rather than inferred. */
  readonly name: string;
  readonly definition: AnyVendoredTool;
}

export const VENDORED_TOOLS: readonly VendoredToolEntry[] = [
  { name: "create_account", definition: CreateAccountTool as AnyVendoredTool },
  { name: "create_attachable", definition: CreateAttachableTool as AnyVendoredTool },
  { name: "create_bill_payment", definition: CreateBillPaymentTool as AnyVendoredTool },
  { name: "create-bill", definition: CreateBillTool as AnyVendoredTool },
  { name: "create_class", definition: CreateClassTool as AnyVendoredTool },
  { name: "create_credit_memo", definition: CreateCreditMemoTool as AnyVendoredTool },
  { name: "create_customer", definition: CreateCustomerTool as AnyVendoredTool },
  { name: "create_department", definition: CreateDepartmentTool as AnyVendoredTool },
  { name: "create_deposit", definition: CreateDepositTool as AnyVendoredTool },
  { name: "create_employee", definition: CreateEmployeeTool as AnyVendoredTool },
  { name: "create_estimate", definition: CreateEstimateTool as AnyVendoredTool },
  { name: "create_invoice", definition: CreateInvoiceTool as AnyVendoredTool },
  { name: "create_item", definition: CreateItemTool as AnyVendoredTool },
  { name: "create_journal_entry", definition: CreateJournalEntryTool as AnyVendoredTool },
  { name: "create_payment_method", definition: CreatePaymentMethodTool as AnyVendoredTool },
  { name: "create_payment", definition: CreatePaymentTool as AnyVendoredTool },
  { name: "create_purchase_order", definition: CreatePurchaseOrderTool as AnyVendoredTool },
  { name: "create_purchase", definition: CreatePurchaseTool as AnyVendoredTool },
  { name: "create_refund_receipt", definition: CreateRefundReceiptTool as AnyVendoredTool },
  { name: "create_sales_receipt", definition: CreateSalesReceiptTool as AnyVendoredTool },
  { name: "create_term", definition: CreateTermTool as AnyVendoredTool },
  { name: "create_time_activity", definition: CreateTimeActivityTool as AnyVendoredTool },
  { name: "create_transfer", definition: CreateTransferTool as AnyVendoredTool },
  { name: "create_vendor_credit", definition: CreateVendorCreditTool as AnyVendoredTool },
  { name: "create-vendor", definition: CreateVendorTool as AnyVendoredTool },
  { name: "delete_attachable", definition: DeleteAttachableTool as AnyVendoredTool },
  { name: "delete_bill_payment", definition: DeleteBillPaymentTool as AnyVendoredTool },
  { name: "delete-bill", definition: DeleteBillTool as AnyVendoredTool },
  { name: "delete_credit_memo", definition: DeleteCreditMemoTool as AnyVendoredTool },
  { name: "delete_customer", definition: DeleteCustomerTool as AnyVendoredTool },
  { name: "delete_deposit", definition: DeleteDepositTool as AnyVendoredTool },
  { name: "delete_employee", definition: DeleteEmployeeTool as AnyVendoredTool },
  { name: "delete_estimate", definition: DeleteEstimateTool as AnyVendoredTool },
  { name: "delete_invoice", definition: DeleteInvoiceTool as AnyVendoredTool },
  { name: "delete_item", definition: DeleteItemTool as AnyVendoredTool },
  { name: "delete_journal_entry", definition: DeleteJournalEntryTool as AnyVendoredTool },
  { name: "delete_payment", definition: DeletePaymentTool as AnyVendoredTool },
  { name: "delete_purchase_order", definition: DeletePurchaseOrderTool as AnyVendoredTool },
  { name: "delete_purchase", definition: DeletePurchaseTool as AnyVendoredTool },
  { name: "delete_refund_receipt", definition: DeleteRefundReceiptTool as AnyVendoredTool },
  { name: "delete_sales_receipt", definition: DeleteSalesReceiptTool as AnyVendoredTool },
  { name: "delete_time_activity", definition: DeleteTimeActivityTool as AnyVendoredTool },
  { name: "delete_transfer", definition: DeleteTransferTool as AnyVendoredTool },
  { name: "delete_vendor_credit", definition: DeleteVendorCreditTool as AnyVendoredTool },
  { name: "delete-vendor", definition: DeleteVendorTool as AnyVendoredTool },
  { name: "get_account", definition: GetAccountTool as AnyVendoredTool },
  { name: "get_aged_payables", definition: GetAgedPayablesTool as AnyVendoredTool },
  { name: "get_aged_receivables", definition: GetAgedReceivablesTool as AnyVendoredTool },
  { name: "get_attachable", definition: GetAttachableTool as AnyVendoredTool },
  { name: "get_balance_sheet", definition: GetBalanceSheetTool as AnyVendoredTool },
  { name: "get_bill_payment", definition: GetBillPaymentTool as AnyVendoredTool },
  { name: "get-bill", definition: GetBillTool as AnyVendoredTool },
  { name: "get_cash_flow", definition: GetCashFlowTool as AnyVendoredTool },
  { name: "get_class", definition: GetClassTool as AnyVendoredTool },
  { name: "get_company_info", definition: GetCompanyInfoTool as AnyVendoredTool },
  { name: "get_credit_memo", definition: GetCreditMemoTool as AnyVendoredTool },
  { name: "get_customer_balance", definition: GetCustomerBalanceTool as AnyVendoredTool },
  { name: "get_customer_sales", definition: GetCustomerSalesTool as AnyVendoredTool },
  { name: "get_customer", definition: GetCustomerTool as AnyVendoredTool },
  { name: "get_department", definition: GetDepartmentTool as AnyVendoredTool },
  { name: "get_deposit", definition: GetDepositTool as AnyVendoredTool },
  { name: "get_employee", definition: GetEmployeeTool as AnyVendoredTool },
  { name: "get_estimate", definition: GetEstimateTool as AnyVendoredTool },
  { name: "get_general_ledger", definition: GetGeneralLedgerTool as AnyVendoredTool },
  { name: "get_invoice_pdf", definition: GetInvoicePdfTool as AnyVendoredTool },
  { name: "get_journal_entry", definition: GetJournalEntryTool as AnyVendoredTool },
  { name: "get_payment_method", definition: GetPaymentMethodTool as AnyVendoredTool },
  { name: "get_payment", definition: GetPaymentTool as AnyVendoredTool },
  { name: "get_profit_and_loss", definition: GetProfitAndLossTool as AnyVendoredTool },
  { name: "get_purchase_order", definition: GetPurchaseOrderTool as AnyVendoredTool },
  { name: "get_purchase", definition: GetPurchaseTool as AnyVendoredTool },
  { name: "get_refund_receipt", definition: GetRefundReceiptTool as AnyVendoredTool },
  { name: "get_sales_receipt", definition: GetSalesReceiptTool as AnyVendoredTool },
  { name: "get_tax_agency", definition: GetTaxAgencyTool as AnyVendoredTool },
  { name: "get_tax_code", definition: GetTaxCodeTool as AnyVendoredTool },
  { name: "get_tax_rate", definition: GetTaxRateTool as AnyVendoredTool },
  { name: "get_term", definition: GetTermTool as AnyVendoredTool },
  { name: "get_time_activity", definition: GetTimeActivityTool as AnyVendoredTool },
  { name: "get_transfer", definition: GetTransferTool as AnyVendoredTool },
  { name: "get_trial_balance", definition: GetTrialBalanceTool as AnyVendoredTool },
  { name: "get_vendor_balance", definition: GetVendorBalanceTool as AnyVendoredTool },
  { name: "get_vendor_credit", definition: GetVendorCreditTool as AnyVendoredTool },
  { name: "get_vendor_expenses", definition: GetVendorExpensesTool as AnyVendoredTool },
  { name: "get-vendor", definition: GetVendorTool as AnyVendoredTool },
  { name: "read_invoice", definition: ReadInvoiceTool as AnyVendoredTool },
  { name: "read_item", definition: ReadItemTool as AnyVendoredTool },
  { name: "search_accounts", definition: SearchAccountsTool as AnyVendoredTool },
  { name: "search_attachables", definition: SearchAttachablesTool as AnyVendoredTool },
  { name: "search_bill_payments", definition: SearchBillPaymentsTool as AnyVendoredTool },
  { name: "search_bills", definition: SearchBillsTool as AnyVendoredTool },
  { name: "search_budgets", definition: SearchBudgetsTool as AnyVendoredTool },
  { name: "search_classes", definition: SearchClassesTool as AnyVendoredTool },
  { name: "search_credit_memos", definition: SearchCreditMemosTool as AnyVendoredTool },
  { name: "search_customers", definition: SearchCustomersTool as AnyVendoredTool },
  { name: "search_departments", definition: SearchDepartmentsTool as AnyVendoredTool },
  { name: "search_deposits", definition: SearchDepositsTool as AnyVendoredTool },
  { name: "search_employees", definition: SearchEmployeesTool as AnyVendoredTool },
  { name: "search_estimates", definition: SearchEstimatesTool as AnyVendoredTool },
  { name: "search_invoices", definition: SearchInvoicesTool as AnyVendoredTool },
  { name: "search_items", definition: SearchItemsTool as AnyVendoredTool },
  { name: "search_journal_entries", definition: SearchJournalEntriesTool as AnyVendoredTool },
  { name: "search_payment_methods", definition: SearchPaymentMethodsTool as AnyVendoredTool },
  { name: "search_payments", definition: SearchPaymentsTool as AnyVendoredTool },
  { name: "search_purchase_orders", definition: SearchPurchaseOrdersTool as AnyVendoredTool },
  { name: "search_purchases", definition: SearchPurchasesTool as AnyVendoredTool },
  { name: "search_refund_receipts", definition: SearchRefundReceiptsTool as AnyVendoredTool },
  { name: "search_sales_receipts", definition: SearchSalesReceiptsTool as AnyVendoredTool },
  { name: "search_tax_agencies", definition: SearchTaxAgenciesTool as AnyVendoredTool },
  { name: "search_tax_codes", definition: SearchTaxCodesTool as AnyVendoredTool },
  { name: "search_tax_rates", definition: SearchTaxRatesTool as AnyVendoredTool },
  { name: "search_terms", definition: SearchTermsTool as AnyVendoredTool },
  { name: "search_time_activities", definition: SearchTimeActivitiesTool as AnyVendoredTool },
  { name: "search_transfers", definition: SearchTransfersTool as AnyVendoredTool },
  { name: "search_vendor_credits", definition: SearchVendorCreditsTool as AnyVendoredTool },
  { name: "search_vendors", definition: SearchVendorsTool as AnyVendoredTool },
  { name: "update_account", definition: UpdateAccountTool as AnyVendoredTool },
  { name: "update_attachable", definition: UpdateAttachableTool as AnyVendoredTool },
  { name: "update_bill_payment", definition: UpdateBillPaymentTool as AnyVendoredTool },
  { name: "update-bill", definition: UpdateBillTool as AnyVendoredTool },
  { name: "update_class", definition: UpdateClassTool as AnyVendoredTool },
  { name: "update_company_info", definition: UpdateCompanyInfoTool as AnyVendoredTool },
  { name: "update_credit_memo", definition: UpdateCreditMemoTool as AnyVendoredTool },
  { name: "update_customer", definition: UpdateCustomerTool as AnyVendoredTool },
  { name: "update_department", definition: UpdateDepartmentTool as AnyVendoredTool },
  { name: "update_deposit", definition: UpdateDepositTool as AnyVendoredTool },
  { name: "update_employee", definition: UpdateEmployeeTool as AnyVendoredTool },
  { name: "update_estimate", definition: UpdateEstimateTool as AnyVendoredTool },
  { name: "update_invoice", definition: UpdateInvoiceTool as AnyVendoredTool },
  { name: "update_item", definition: UpdateItemTool as AnyVendoredTool },
  { name: "update_journal_entry", definition: UpdateJournalEntryTool as AnyVendoredTool },
  { name: "update_payment_method", definition: UpdatePaymentMethodTool as AnyVendoredTool },
  { name: "update_payment", definition: UpdatePaymentTool as AnyVendoredTool },
  { name: "update_purchase_order", definition: UpdatePurchaseOrderTool as AnyVendoredTool },
  { name: "update_purchase", definition: UpdatePurchaseTool as AnyVendoredTool },
  { name: "update_refund_receipt", definition: UpdateRefundReceiptTool as AnyVendoredTool },
  { name: "update_sales_receipt", definition: UpdateSalesReceiptTool as AnyVendoredTool },
  { name: "update_term", definition: UpdateTermTool as AnyVendoredTool },
  { name: "update_time_activity", definition: UpdateTimeActivityTool as AnyVendoredTool },
  { name: "update_transfer", definition: UpdateTransferTool as AnyVendoredTool },
  { name: "update_vendor_credit", definition: UpdateVendorCreditTool as AnyVendoredTool },
  { name: "update-vendor", definition: UpdateVendorTool as AnyVendoredTool },
];
