/**
 * Mock for the QuickBooks client and node-quickbooks library.
 * Used by all handler and tool tests to avoid actual API calls.
 */
import { jest } from '@jest/globals';

// Mock QuickBooks instance methods
export const mockQuickBooksInstance = {
  // Customer methods
  createCustomer: jest.fn(),
  getCustomer: jest.fn(),
  updateCustomer: jest.fn(),
  deleteCustomer: jest.fn(),
  findCustomers: jest.fn(),

  // Invoice methods
  createInvoice: jest.fn(),
  getInvoice: jest.fn(),
  updateInvoice: jest.fn(),
  deleteInvoice: jest.fn(),
  findInvoices: jest.fn(),

  // Estimate methods
  createEstimate: jest.fn(),
  getEstimate: jest.fn(),
  updateEstimate: jest.fn(),
  deleteEstimate: jest.fn(),
  findEstimates: jest.fn(),

  // Bill methods
  createBill: jest.fn(),
  getBill: jest.fn(),
  updateBill: jest.fn(),
  deleteBill: jest.fn(),
  findBills: jest.fn(),

  // Vendor methods
  createVendor: jest.fn(),
  getVendor: jest.fn(),
  updateVendor: jest.fn(),
  deleteVendor: jest.fn(),
  findVendors: jest.fn(),

  // Employee methods
  createEmployee: jest.fn(),
  getEmployee: jest.fn(),
  updateEmployee: jest.fn(),
  deleteEmployee: jest.fn(),
  findEmployees: jest.fn(),

  // Account methods
  createAccount: jest.fn(),
  getAccount: jest.fn(),
  updateAccount: jest.fn(),
  findAccounts: jest.fn(),

  // Item methods
  createItem: jest.fn(),
  getItem: jest.fn(),
  updateItem: jest.fn(),
  deleteItem: jest.fn(),
  findItems: jest.fn(),

  // Journal Entry methods
  createJournalEntry: jest.fn(),
  getJournalEntry: jest.fn(),
  updateJournalEntry: jest.fn(),
  deleteJournalEntry: jest.fn(),
  findJournalEntries: jest.fn(),

  // Bill Payment methods
  createBillPayment: jest.fn(),
  getBillPayment: jest.fn(),
  updateBillPayment: jest.fn(),
  deleteBillPayment: jest.fn(),
  findBillPayments: jest.fn(),

  // Purchase methods
  createPurchase: jest.fn(),
  getPurchase: jest.fn(),
  updatePurchase: jest.fn(),
  deletePurchase: jest.fn(),
  findPurchases: jest.fn(),

  // Payment methods
  createPayment: jest.fn(),
  getPayment: jest.fn(),
  updatePayment: jest.fn(),
  deletePayment: jest.fn(),
  findPayments: jest.fn(),

  // SalesReceipt methods
  createSalesReceipt: jest.fn(),
  getSalesReceipt: jest.fn(),
  updateSalesReceipt: jest.fn(),
  deleteSalesReceipt: jest.fn(),
  findSalesReceipts: jest.fn(),

  // CreditMemo methods
  createCreditMemo: jest.fn(),
  getCreditMemo: jest.fn(),
  updateCreditMemo: jest.fn(),
  deleteCreditMemo: jest.fn(),
  findCreditMemos: jest.fn(),

  // RefundReceipt methods
  createRefundReceipt: jest.fn(),
  getRefundReceipt: jest.fn(),
  updateRefundReceipt: jest.fn(),
  deleteRefundReceipt: jest.fn(),
  findRefundReceipts: jest.fn(),

  // PurchaseOrder methods
  createPurchaseOrder: jest.fn(),
  getPurchaseOrder: jest.fn(),
  updatePurchaseOrder: jest.fn(),
  deletePurchaseOrder: jest.fn(),
  findPurchaseOrders: jest.fn(),

  // VendorCredit methods
  createVendorCredit: jest.fn(),
  getVendorCredit: jest.fn(),
  updateVendorCredit: jest.fn(),
  deleteVendorCredit: jest.fn(),
  findVendorCredits: jest.fn(),

  // Deposit methods
  createDeposit: jest.fn(),
  getDeposit: jest.fn(),
  updateDeposit: jest.fn(),
  deleteDeposit: jest.fn(),
  findDeposits: jest.fn(),

  // Transfer methods
  createTransfer: jest.fn(),
  getTransfer: jest.fn(),
  updateTransfer: jest.fn(),
  deleteTransfer: jest.fn(),
  findTransfers: jest.fn(),

  // TimeActivity methods
  createTimeActivity: jest.fn(),
  getTimeActivity: jest.fn(),
  updateTimeActivity: jest.fn(),
  deleteTimeActivity: jest.fn(),
  findTimeActivities: jest.fn(),

  // Class methods
  createClass: jest.fn(),
  getClass: jest.fn(),
  updateClass: jest.fn(),
  findClasses: jest.fn(),

  // Department methods
  createDepartment: jest.fn(),
  getDepartment: jest.fn(),
  updateDepartment: jest.fn(),
  findDepartments: jest.fn(),

  // Term methods
  createTerm: jest.fn(),
  getTerm: jest.fn(),
  updateTerm: jest.fn(),
  findTerms: jest.fn(),

  // PaymentMethod methods
  createPaymentMethod: jest.fn(),
  getPaymentMethod: jest.fn(),
  updatePaymentMethod: jest.fn(),
  findPaymentMethods: jest.fn(),

  // TaxCode methods
  getTaxCode: jest.fn(),
  findTaxCodes: jest.fn(),

  // TaxRate methods
  getTaxRate: jest.fn(),
  findTaxRates: jest.fn(),

  // TaxAgency methods
  getTaxAgency: jest.fn(),
  findTaxAgencies: jest.fn(),

  // CompanyInfo methods
  getCompanyInfo: jest.fn(),
  updateCompanyInfo: jest.fn(),

  // Attachable methods
  createAttachable: jest.fn(),
  getAttachable: jest.fn(),
  updateAttachable: jest.fn(),
  deleteAttachable: jest.fn(),
  findAttachables: jest.fn(),

  // Report methods
  reportBalanceSheet: jest.fn(),
  reportProfitAndLoss: jest.fn(),
  reportCashFlow: jest.fn(),
  reportTrialBalance: jest.fn(),
  reportGeneralLedger: jest.fn(),
  reportCustomerSales: jest.fn(),
  reportItemSales: jest.fn(),
  reportAgedReceivables: jest.fn(),
  reportAgedReceivableDetail: jest.fn(),
  reportCustomerBalance: jest.fn(),
  reportAgedPayables: jest.fn(),
  reportAgedPayableDetail: jest.fn(),
  reportVendorBalance: jest.fn(),
  reportVendorExpenses: jest.fn(),
  reportSalesTaxLiability: jest.fn(),
};

// Mock getQuickbooks function (replaces the old singleton client mock)
export const mockGetQuickbooks = jest.fn<() => Promise<typeof mockQuickBooksInstance>>()
  .mockResolvedValue(mockQuickBooksInstance);

// Helper to create a successful callback mock
export function mockSuccessCallback<T>(data: T) {
  return (...args: unknown[]) => {
    const callback = args[args.length - 1] as (err: null, result: T) => void;
    callback(null, data);
  };
}

// Helper to create an error callback mock
export function mockErrorCallback(error: Error | string) {
  return (...args: unknown[]) => {
    const callback = args[args.length - 1] as (err: Error | string, result: null) => void;
    callback(error, null);
  };
}

// Helper to create a find/search callback mock (returns QueryResponse)
export function mockFindCallback<T>(entities: T[]) {
  return (...args: unknown[]) => {
    const callback = args[args.length - 1] as (err: null, result: { QueryResponse: Record<string, T[]> }) => void;
    callback(null, { QueryResponse: { Entity: entities } });
  };
}

// Reset all mocks
export function resetAllMocks() {
  Object.values(mockQuickBooksInstance).forEach((mock) => {
    if (typeof mock === 'function' && 'mockReset' in mock) {
      (mock as jest.Mock).mockReset();
    }
  });
  mockGetQuickbooks.mockReset();
  mockGetQuickbooks.mockResolvedValue(mockQuickBooksInstance);
}
