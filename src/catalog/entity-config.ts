// src/catalog/entity-config.ts
import { EntityConfig } from "./types.js";

export const ENTITIES: Record<string, EntityConfig> = {
  customer: {
    label: "Customer",
    queryResponseKey: "Customer",
    methods: {
      create: "createCustomer",
      get: "getCustomer",
      update: "updateCustomer",
      delete: "deleteCustomer",
      find: "findCustomers",
    },
    softDelete: true,
  },
  invoice: {
    label: "Invoice",
    queryResponseKey: "Invoice",
    methods: {
      create: "createInvoice",
      get: "getInvoice",
      update: "updateInvoice",
      find: "findInvoices",
    },
  },
  estimate: {
    label: "Estimate",
    queryResponseKey: "Estimate",
    methods: {
      create: "createEstimate",
      get: "getEstimate",
      update: "updateEstimate",
      delete: "deleteEstimate",
      find: "findEstimates",
    },
  },
  bill: {
    label: "Bill",
    queryResponseKey: "Bill",
    methods: {
      create: "createBill",
      get: "getBill",
      update: "updateBill",
      delete: "deleteBill",
      find: "findBills",
    },
  },
  account: {
    label: "Account",
    queryResponseKey: "Account",
    methods: {
      create: "createAccount",
      update: "updateAccount",
      find: "findAccounts",
    },
  },
  item: {
    label: "Item",
    queryResponseKey: "Item",
    methods: {
      create: "createItem",
      get: "getItem",
      update: "updateItem",
      find: "findItems",
    },
  },
  vendor: {
    label: "Vendor",
    queryResponseKey: "Vendor",
    methods: {
      create: "createVendor",
      get: "getVendor",
      update: "updateVendor",
      delete: "deleteVendor",
      find: "findVendors",
    },
    softDelete: true,
  },
  employee: {
    label: "Employee",
    queryResponseKey: "Employee",
    methods: {
      create: "createEmployee",
      get: "getEmployee",
      update: "updateEmployee",
      find: "findEmployees",
    },
  },
  journal_entry: {
    label: "Journal Entry",
    queryResponseKey: "JournalEntry",
    methods: {
      create: "createJournalEntry",
      get: "getJournalEntry",
      update: "updateJournalEntry",
      delete: "deleteJournalEntry",
      find: "findJournalEntries",
    },
  },
  bill_payment: {
    label: "Bill Payment",
    queryResponseKey: "BillPayment",
    methods: {
      create: "createBillPayment",
      get: "getBillPayment",
      update: "updateBillPayment",
      delete: "deleteBillPayment",
      find: "findBillPayments",
    },
  },
  purchase: {
    label: "Purchase",
    queryResponseKey: "Purchase",
    methods: {
      create: "createPurchase",
      get: "getPurchase",
      update: "updatePurchase",
      delete: "deletePurchase",
      find: "findPurchases",
    },
  },
};
