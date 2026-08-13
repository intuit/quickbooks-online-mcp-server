declare module 'node-quickbooks' {
  export default class QuickBooks {
    constructor(
      consumerKey: string,
      consumerSecret: string,
      accessToken: string,
      tokenSecret: boolean | string,
      realmId: string,
      useSandbox?: boolean,
      debug?: boolean,
      minorversion?: string | number | null,
      oauthVersion?: string,
      refreshToken?: string
    );

    findCustomers(options: object, callback: (err: any, customers: any) => void): void;
    createCustomer(customerData: object, callback: (err: any, customer: any) => void): void;
    getCustomer(id: string, callback: (err: any, customer: any) => void): void;
    updateCustomer(customerData: object, callback: (err: any, customer: any) => void): void;
    deleteCustomer(idOrEntity: any, callback: (err: any, response: any) => void): void;

    // Estimate CRUD
    findEstimates(options: object, callback: (err: any, estimates: any) => void): void;
    createEstimate(estimateData: object, callback: (err: any, estimate: any) => void): void;
    getEstimate(id: string, callback: (err: any, estimate: any) => void): void;
    updateEstimate(estimateData: object, callback: (err: any, estimate: any) => void): void;
    deleteEstimate(idOrEntity: any, callback: (err: any, response: any) => void): void;
    findBills(options: {
      fetchAll?: boolean;
      limit?: number;
      offset?: number;
      asc?: boolean;
      desc?: boolean;
      DueDate?: string;
      TxnDate?: string;
      Balance?: number;
      TotalAmt?: number;
      VendorRef?: string;
    }, callback: (err: any, bills: any) => void): void;
    createBill(bill: object, callback: (err: any, bill: any) => void): void;
    updateBill(bill: object, callback: (err: any, bill: any) => void): void;
    deleteBill(bill: object, callback: (err: any, bill: any) => void): void;
    getBill(id: string, callback: (err: any, bill: any) => void): void;
    findVendors(options: {
      fetchAll?: boolean;
      limit?: number;
      offset?: number;
      asc?: boolean;
      desc?: boolean;
      DisplayName?: string;
      GivenName?: string;
      FamilyName?: string;
      CompanyName?: string;
      Active?: boolean;
    }, callback: (err: any, vendors: any) => void): void;
    createVendor(vendor: object, callback: (err: any, vendor: any) => void): void;
    updateVendor(vendor: object, callback: (err: any, vendor: any) => void): void;
    deleteVendor(vendor: object, callback: (err: any, vendor: any) => void): void;
    getVendor(id: string, callback: (err: any, vendor: any) => void): void;

    // Employee CRUD
    findEmployees(options: object, callback: (err: any, employees: any) => void): void;
    createEmployee(employeeData: object, callback: (err: any, employee: any) => void): void;
    getEmployee(id: string, callback: (err: any, employee: any) => void): void;
    updateEmployee(employeeData: object, callback: (err: any, employee: any) => void): void;

    // Journal Entry CRUD
    findJournalEntries(options: object, callback: (err: any, journalEntries: any) => void): void;
    createJournalEntry(journalEntryData: object, callback: (err: any, journalEntry: any) => void): void;
    getJournalEntry(id: string, callback: (err: any, journalEntry: any) => void): void;
    updateJournalEntry(journalEntryData: object, callback: (err: any, journalEntry: any) => void): void;
    deleteJournalEntry(idOrEntity: any, callback: (err: any, response: any) => void): void;

    // Bill Payment CRUD
    findBillPayments(options: object, callback: (err: any, billPayments: any) => void): void;
    createBillPayment(billPaymentData: object, callback: (err: any, billPayment: any) => void): void;
    getBillPayment(id: string, callback: (err: any, billPayment: any) => void): void;
    updateBillPayment(billPaymentData: object, callback: (err: any, billPayment: any) => void): void;
    deleteBillPayment(idOrEntity: any, callback: (err: any, response: any) => void): void;

    // Purchase CRUD
    findPurchases(options: object, callback: (err: any, purchases: any) => void): void;
    createPurchase(purchaseData: object, callback: (err: any, purchase: any) => void): void;
    getPurchase(id: string, callback: (err: any, purchase: any) => void): void;
    updatePurchase(purchaseData: object, callback: (err: any, purchase: any) => void): void;
    deletePurchase(idOrEntity: any, callback: (err: any, response: any) => void): void;

    // You can add more methods as needed
  }
}
