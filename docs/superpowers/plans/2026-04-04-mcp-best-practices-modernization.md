# QuickBooks MCP Server — Best Practices Modernization Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Modernize the QuickBooks Online MCP server to align with MCP best practices — reduce tool count from 50 to 7 via search+execute pattern, add server instructions, tool annotations, rich parameter schemas, and actionable error messages.

**Architecture:** The current 50 one-tool-per-action design exceeds the 30-tool threshold where context-window cost degrades model performance. We consolidate to 2 catalog tools (search_actions + execute_action) plus 5 promoted high-use tools. All 50 handler files collapse into a generic CRUD handler driven by an entity config table. The registration wrapper (`RegisterTool`) is replaced with direct `server.registerTool()` calls using the modern SDK API.

**Tech Stack:** TypeScript 6, `@modelcontextprotocol/sdk` 1.29, Zod 4, `node-quickbooks` 2.0.50, Bun

---

## Audit Summary (What Violates Best Practices)

| Area | Current State | Best Practice | Severity |
|---|---|---|---|
| Tool count | 50 tools | ≤30, or search+execute | **Critical** |
| Server `instructions` | None | "Highest-leverage one-liner in the spec" | **High** |
| Tool descriptions | Vague one-liners, no disambiguation | Detailed: what it does, returns, doesn't do | **High** |
| Parameter schemas | Most use `z.any()`, no `.describe()` | Tight constraints, every param described | **High** |
| Tool annotations | None | readOnlyHint, destructiveHint on every tool | **Medium** |
| Error messages | Generic "Error creating X" | Actionable hints ("use search_X to find IDs") | **Medium** |
| Auth token storage | Plaintext `.env` file | OS keychain for local servers | **Medium** |
| Handler duplication | 50 near-identical files | Generic handler + entity config | **High** |
| Registration API | Custom `RegisterTool` wrapper with `server.tool()` | Direct `server.registerTool()` | **Low** |
| Structured output | None | `outputSchema` + `structuredContent` | **Low** |

---

## File Structure (After Modernization)

```
src/
├── index.ts                          # MODIFY — rewire to 7 tools
├── server/
│   └── qbo-mcp-server.ts            # MODIFY — add instructions
├── catalog/
│   ├── entity-config.ts             # CREATE — entity config table (11 entities)
│   ├── action-catalog.ts            # CREATE — full action catalog (50 actions)
│   └── types.ts                     # CREATE — EntityConfig, ActionEntry types
├── handlers/
│   └── generic-handler.ts           # CREATE — generic CRUD handler
├── tools/
│   ├── search-actions.tool.ts       # CREATE — catalog search tool
│   ├── execute-action.tool.ts       # CREATE — catalog execute tool
│   ├── search-customers.tool.ts     # CREATE — promoted tool (rewrite)
│   ├── create-invoice.tool.ts       # CREATE — promoted tool (rewrite)
│   ├── search-invoices.tool.ts      # CREATE — promoted tool (rewrite)
│   ├── search-accounts.tool.ts      # CREATE — promoted tool (rewrite)
│   ├── create-customer.tool.ts      # CREATE — promoted tool (rewrite)
│   └── [44 old tool files]          # DELETE
├── handlers/
│   └── [50 old handler files]       # DELETE
├── helpers/
│   ├── register-tool.ts             # DELETE
│   ├── format-error.ts              # KEEP
│   └── build-quickbooks-search-criteria.ts  # KEEP
├── clients/
│   └── quickbooks-client.ts         # KEEP (auth hardening is a separate plan)
└── types/
    ├── tool-definition.ts           # DELETE (no longer needed)
    ├── tool-response.ts             # KEEP
    └── *.d.ts                       # KEEP
```

---

## Phase 1: Quick Wins

### Task 1: Add Server Instructions

The `instructions` field lands in Claude's system prompt. It's the single highest-leverage improvement — tells Claude how to use the tools correctly without per-tool schema bloat.

**Files:**
- Modify: `src/server/qbo-mcp-server.ts`

- [ ] **Step 1: Add instructions to McpServer constructor**

```typescript
// src/server/qbo-mcp-server.ts
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
```

- [ ] **Step 2: Build and verify**

Run: `bun run build`
Expected: Clean compilation, no errors.

- [ ] **Step 3: Commit**

```bash
git add src/server/qbo-mcp-server.ts
git commit -m "feat: add server instructions for Claude tool-use guidance"
```

---

## Phase 2: Architecture Consolidation

### Task 2: Create Catalog Types

Define the types that power the entity config and action catalog.

**Files:**
- Create: `src/catalog/types.ts`

- [ ] **Step 1: Write the types file**

```typescript
// src/catalog/types.ts
import { z } from "zod";

/** Configuration for a single QuickBooks entity type. */
export interface EntityConfig {
  /** Human-readable singular label, e.g. "Customer" */
  label: string;
  /** Key in the QB QueryResponse object, e.g. "Customer" */
  queryResponseKey: string;
  /** node-quickbooks method names per CRUD operation */
  methods: {
    create?: string;
    get?: string;
    update?: string;
    delete?: string;
    find?: string;
  };
  /** Whether delete is a soft-delete (sets Active=false) */
  softDelete?: boolean;
}

/** A single action in the catalog, discoverable via search_actions. */
export interface ActionEntry {
  /** Unique action ID, e.g. "create_customer" */
  id: string;
  /** Entity key, e.g. "customer" */
  entity: string;
  /** Operation type */
  operation: "create" | "get" | "update" | "delete" | "search";
  /** Human-readable description for Claude */
  description: string;
  /** JSON Schema describing the action's parameters (shown to Claude on search) */
  parameterHints: Record<string, string>;
}
```

- [ ] **Step 2: Build and verify**

Run: `bun run build`
Expected: Clean compilation.

- [ ] **Step 3: Commit**

```bash
git add src/catalog/types.ts
git commit -m "feat: add catalog types for entity config and action entries"
```

---

### Task 3: Create Entity Config Table

A single lookup table that replaces the per-entity knowledge scattered across 50 handler files.

**Files:**
- Create: `src/catalog/entity-config.ts`

- [ ] **Step 1: Write the entity config**

```typescript
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
```

- [ ] **Step 2: Build and verify**

Run: `bun run build`
Expected: Clean compilation.

- [ ] **Step 3: Commit**

```bash
git add src/catalog/entity-config.ts
git commit -m "feat: add entity config table for all 11 QB entity types"
```

---

### Task 4: Create Action Catalog

The full catalog of 50 actions with rich descriptions and parameter hints. This is what `search_actions` searches against.

**Files:**
- Create: `src/catalog/action-catalog.ts`

- [ ] **Step 1: Write the action catalog**

```typescript
// src/catalog/action-catalog.ts
import { ActionEntry } from "./types.js";

/**
 * Complete catalog of QuickBooks operations. Each entry is searchable by
 * intent via the search_actions tool. Parameter hints are shown to Claude
 * so it knows what to pass to execute_action.
 */
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
];

/** Simple keyword search over the action catalog. */
export function searchCatalog(intent: string, limit = 10): ActionEntry[] {
  const terms = intent.toLowerCase().split(/\s+/);
  const scored = ACTION_CATALOG.map((action) => {
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
```

- [ ] **Step 2: Build and verify**

Run: `bun run build`
Expected: Clean compilation.

- [ ] **Step 3: Commit**

```bash
git add src/catalog/action-catalog.ts
git commit -m "feat: add action catalog with 50 searchable QB operations"
```

---

### Task 5: Create Generic Handler

Replace 50 near-identical handler files with one generic CRUD handler driven by entity config.

**Files:**
- Create: `src/handlers/generic-handler.ts`

- [ ] **Step 1: Write the generic handler**

```typescript
// src/handlers/generic-handler.ts
import { quickbooksClient } from "../clients/quickbooks-client.js";
import { ENTITIES } from "../catalog/entity-config.js";
import { formatError } from "../helpers/format-error.js";
import {
  buildQuickbooksSearchCriteria,
  QuickbooksSearchCriteriaInput,
} from "../helpers/build-quickbooks-search-criteria.js";

/**
 * Call a node-quickbooks method, promisifying the callback API.
 */
function callQB(methodName: string, ...args: any[]): Promise<any> {
  const qb = quickbooksClient.getQuickbooks();
  return new Promise((resolve, reject) => {
    (qb as any)[methodName](...args, (err: any, result: any) => {
      if (err) reject(err);
      else resolve(result);
    });
  });
}

export async function executeCreate(entity: string, data: any): Promise<any> {
  const config = ENTITIES[entity];
  if (!config?.methods.create) {
    throw new Error(`Create is not supported for ${entity}. Use search_actions to find available operations.`);
  }
  await quickbooksClient.authenticate();
  return callQB(config.methods.create, data);
}

export async function executeGet(entity: string, id: string): Promise<any> {
  const config = ENTITIES[entity];
  if (!config?.methods.get) {
    throw new Error(`Get by ID is not supported for ${entity}. Use search_actions to find available operations.`);
  }
  await quickbooksClient.authenticate();
  return callQB(config.methods.get, id);
}

export async function executeUpdate(entity: string, data: any): Promise<any> {
  const config = ENTITIES[entity];
  if (!config?.methods.update) {
    throw new Error(`Update is not supported for ${entity}. Use search_actions to find available operations.`);
  }
  await quickbooksClient.authenticate();
  return callQB(config.methods.update, data);
}

export async function executeDelete(entity: string, idOrEntity: any): Promise<any> {
  const config = ENTITIES[entity];
  if (!config?.methods.delete) {
    throw new Error(`Delete is not supported for ${entity}. Use search_actions to find available operations.`);
  }
  await quickbooksClient.authenticate();
  const qb = quickbooksClient.getQuickbooks();

  // Soft-delete entities get set to Active=false
  if (config.softDelete) {
    const id = typeof idOrEntity === "object" ? idOrEntity.Id : idOrEntity;
    const current = await callQB(config.methods.get!, id);
    return callQB(config.methods.update!, {
      Id: current.Id,
      SyncToken: current.SyncToken,
      Active: false,
    });
  }

  return callQB(config.methods.delete, idOrEntity);
}

export async function executeSearch(entity: string, criteria: any): Promise<any[]> {
  const config = ENTITIES[entity];
  if (!config?.methods.find) {
    throw new Error(`Search is not supported for ${entity}. Use search_actions to find available operations.`);
  }
  await quickbooksClient.authenticate();
  const normalized = buildQuickbooksSearchCriteria(criteria ?? {});
  const result = await callQB(config.methods.find, normalized);
  return result?.QueryResponse?.[config.queryResponseKey] ?? [];
}
```

- [ ] **Step 2: Build and verify**

Run: `bun run build`
Expected: Clean compilation.

- [ ] **Step 3: Commit**

```bash
git add src/handlers/generic-handler.ts
git commit -m "feat: add generic CRUD handler replacing 50 handler files"
```

---

### Task 6: Create search_actions Tool

The catalog discovery tool. Claude calls this first to find what operations are available.

**Files:**
- Create: `src/tools/search-actions.tool.ts`

- [ ] **Step 1: Write the search_actions tool**

```typescript
// src/tools/search-actions.tool.ts
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { searchCatalog } from "../catalog/action-catalog.js";

const inputSchema = {
  intent: z
    .string()
    .describe(
      "What you want to do, in plain English. Examples: 'create a customer', 'find invoices by date', 'delete a journal entry'.",
    ),
  limit: z
    .number()
    .int()
    .min(1)
    .max(20)
    .default(10)
    .describe("Max results to return. Default 10."),
};

export function registerSearchActions(server: McpServer) {
  server.registerTool(
    "search_actions",
    {
      description:
        "Find available QuickBooks operations matching an intent. Returns action IDs, descriptions, and parameter hints. Call this FIRST to discover what you can do, then use execute_action to run the action. Also see the 5 promoted tools: search_customers, create_customer, create_invoice, search_invoices, search_accounts.",
      inputSchema,
      annotations: { readOnlyHint: true },
    },
    async ({ intent, limit }) => {
      const matches = searchCatalog(intent, limit);
      if (matches.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `No actions found for "${intent}". Try broader terms. Available entities: customer, invoice, estimate, bill, account, item, vendor, employee, journal_entry, bill_payment, purchase. Operations: create, get, update, delete, search.`,
            },
          ],
        };
      }
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              matches.map((m) => ({
                action_id: m.id,
                entity: m.entity,
                operation: m.operation,
                description: m.description,
                parameters: m.parameterHints,
              })),
              null,
              2,
            ),
          },
        ],
      };
    },
  );
}
```

- [ ] **Step 2: Build and verify**

Run: `bun run build`
Expected: Clean compilation.

- [ ] **Step 3: Commit**

```bash
git add src/tools/search-actions.tool.ts
git commit -m "feat: add search_actions catalog discovery tool"
```

---

### Task 7: Create execute_action Tool

The generic execution tool. Runs any action from the catalog by ID.

**Files:**
- Create: `src/tools/execute-action.tool.ts`

- [ ] **Step 1: Write the execute_action tool**

```typescript
// src/tools/execute-action.tool.ts
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ACTION_CATALOG } from "../catalog/action-catalog.js";
import { ENTITIES } from "../catalog/entity-config.js";
import {
  executeCreate,
  executeGet,
  executeUpdate,
  executeDelete,
  executeSearch,
} from "../handlers/generic-handler.js";
import { formatError } from "../helpers/format-error.js";

const inputSchema = {
  action_id: z
    .string()
    .describe(
      "The action ID from search_actions results (e.g. 'create_customer', 'search_invoices').",
    ),
  params: z
    .record(z.string(), z.any())
    .describe(
      "Parameters for the action. Shape depends on the operation type — check parameterHints from search_actions.",
    ),
};

export function registerExecuteAction(server: McpServer) {
  server.registerTool(
    "execute_action",
    {
      description:
        "Execute a QuickBooks action by its ID. Get the action_id and required params from search_actions first. For create/update: pass { data: {...} }. For get/delete: pass { id: 'the-id' }. For search: pass { criteria: [...], limit?, offset? }.",
      inputSchema,
      annotations: { openWorldHint: true },
    },
    async ({ action_id, params }) => {
      const action = ACTION_CATALOG.find((a) => a.id === action_id);
      if (!action) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `Unknown action "${action_id}". Use search_actions to find valid action IDs.`,
            },
          ],
        };
      }

      const config = ENTITIES[action.entity];
      if (!config) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `Entity "${action.entity}" not configured. This is a server bug.`,
            },
          ],
        };
      }

      const label = config.label;
      const op = action.operation;

      try {
        let result: any;

        switch (op) {
          case "create":
            result = await executeCreate(action.entity, params.data);
            return {
              content: [
                {
                  type: "text" as const,
                  text: `${label} created successfully (ID: ${result?.Id ?? "unknown"}):`,
                },
                { type: "text" as const, text: JSON.stringify(result, null, 2) },
              ],
            };

          case "get":
            result = await executeGet(action.entity, params.id);
            return {
              content: [
                { type: "text" as const, text: `${label} (ID: ${params.id}):` },
                { type: "text" as const, text: JSON.stringify(result, null, 2) },
              ],
            };

          case "update":
            result = await executeUpdate(action.entity, params.data);
            return {
              content: [
                {
                  type: "text" as const,
                  text: `${label} updated successfully (ID: ${result?.Id ?? params.data?.Id ?? "unknown"}):`,
                },
                { type: "text" as const, text: JSON.stringify(result, null, 2) },
              ],
            };

          case "delete": {
            const deleteId = params.id ?? params.data;
            result = await executeDelete(action.entity, deleteId);
            const verb = config.softDelete ? "deactivated" : "deleted";
            return {
              content: [
                { type: "text" as const, text: `${label} ${verb} successfully.` },
                { type: "text" as const, text: JSON.stringify(result, null, 2) },
              ],
            };
          }

          case "search": {
            const items = await executeSearch(action.entity, params.criteria ?? params);
            const count = items.length;
            const truncated = items.slice(0, 50);
            const suffix = count > 50 ? ` Showing first 50 of ${count}. Refine your search criteria to narrow down.` : "";
            return {
              content: [
                { type: "text" as const, text: `Found ${count} ${label.toLowerCase()}(s).${suffix}` },
                { type: "text" as const, text: JSON.stringify(truncated, null, 2) },
              ],
            };
          }

          default:
            return {
              isError: true,
              content: [
                {
                  type: "text" as const,
                  text: `Unknown operation "${op}" for action "${action_id}".`,
                },
              ],
            };
        }
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `Error executing ${action_id}: ${formatError(error)}. Use search_actions to verify the action exists and check the parameterHints for correct parameter format.`,
            },
          ],
        };
      }
    },
  );
}
```

- [ ] **Step 2: Build and verify**

Run: `bun run build`
Expected: Clean compilation.

- [ ] **Step 3: Commit**

```bash
git add src/tools/execute-action.tool.ts
git commit -m "feat: add execute_action tool for running any catalog action"
```

---

## Phase 3: Promoted Tools

The 5 most-used operations get dedicated tools with rich schemas, detailed descriptions, and proper annotations. These give Claude a fast path for the most common workflows without needing the search+execute round-trip.

### Task 8: Promoted Tool — search_customers

**Files:**
- Create: `src/tools/promoted/search-customers.tool.ts`

- [ ] **Step 1: Write the promoted search_customers tool**

```typescript
// src/tools/promoted/search-customers.tool.ts
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { executeSearch } from "../handlers/generic-handler.js";
import { formatError } from "../helpers/format-error.js";

const inputSchema = {
  criteria: z
    .array(
      z.object({
        field: z
          .enum([
            "Id",
            "DisplayName",
            "GivenName",
            "FamilyName",
            "CompanyName",
            "PrimaryEmailAddr",
            "PrimaryPhone",
            "Balance",
            "Active",
            "MetaData.CreateTime",
            "MetaData.LastUpdatedTime",
          ])
          .describe("Customer field to filter on."),
        value: z.union([z.string(), z.number(), z.boolean()]).describe("Value to match."),
        operator: z
          .enum(["=", "<", ">", "<=", ">=", "LIKE", "IN"])
          .default("=")
          .describe("Comparison operator. Use LIKE with % for partial matches (e.g. 'John%')."),
      }),
    )
    .optional()
    .describe("Filters to apply. Omit for unfiltered search."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(1000)
    .default(100)
    .describe("Max results. Default 100."),
  offset: z
    .number()
    .int()
    .min(0)
    .default(0)
    .describe("Number of results to skip for pagination."),
  asc: z.string().optional().describe("Sort ascending by this field name."),
  desc: z.string().optional().describe("Sort descending by this field name."),
};

export function registerSearchCustomers(server: McpServer) {
  server.registerTool(
    "search_customers",
    {
      description:
        "Search for customers in QuickBooks Online. Returns matching customer records with IDs, names, contact info, and balances. Use this to find customer IDs before creating invoices or to look up customer details. For operations on a specific customer (update, delete), use execute_action with the customer's ID.",
      inputSchema,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ criteria, limit, offset, asc, desc }) => {
      try {
        const searchPayload: any[] = [
          ...(criteria ?? []).map((c) => ({ field: c.field, value: c.value, operator: c.operator })),
        ];
        if (limit) searchPayload.push({ field: "limit", value: limit });
        if (offset) searchPayload.push({ field: "offset", value: offset });
        if (asc) searchPayload.push({ field: "asc", value: asc });
        if (desc) searchPayload.push({ field: "desc", value: desc });

        const results = await executeSearch("customer", searchPayload.length > 0 ? searchPayload : {});
        const count = results.length;
        return {
          content: [
            { type: "text" as const, text: `Found ${count} customer(s):` },
            { type: "text" as const, text: JSON.stringify(results, null, 2) },
          ],
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `Error searching customers: ${formatError(error)}`,
            },
          ],
        };
      }
    },
  );
}
```

- [ ] **Step 2: Build and verify**

Run: `bun run build`
Expected: Clean compilation.

- [ ] **Step 3: Commit**

```bash
git add src/tools/promoted/search-customers.tool.ts
git commit -m "feat: add promoted search_customers tool with rich schema"
```

---

### Task 9: Promoted Tool — create_customer

**Files:**
- Create: `src/tools/promoted/create-customer.tool.ts`

- [ ] **Step 1: Write the promoted create_customer tool**

```typescript
// src/tools/promoted/create-customer.tool.ts
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { executeCreate } from "../handlers/generic-handler.js";
import { formatError } from "../helpers/format-error.js";

const inputSchema = {
  DisplayName: z
    .string()
    .min(1)
    .describe("Unique display name for the customer. Required."),
  GivenName: z.string().optional().describe("Customer's first name."),
  FamilyName: z.string().optional().describe("Customer's last name."),
  CompanyName: z.string().optional().describe("Customer's company name."),
  PrimaryEmailAddr: z
    .object({ Address: z.string().email() })
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
```

- [ ] **Step 2: Build and verify**

Run: `bun run build`
Expected: Clean compilation.

- [ ] **Step 3: Commit**

```bash
git add src/tools/promoted/create-customer.tool.ts
git commit -m "feat: add promoted create_customer tool with rich schema"
```

---

### Task 10: Promoted Tool — create_invoice

**Files:**
- Create: `src/tools/promoted/create-invoice.tool.ts`

- [ ] **Step 1: Write the promoted create_invoice tool**

```typescript
// src/tools/promoted/create-invoice.tool.ts
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { executeCreate } from "../handlers/generic-handler.js";
import { formatError } from "../helpers/format-error.js";

const lineItemSchema = z.object({
  Description: z.string().optional().describe("Line item description shown on the invoice."),
  Amount: z.number().describe("Total amount for this line (Qty * UnitPrice)."),
  DetailType: z
    .literal("SalesItemLineDetail")
    .describe("Must be 'SalesItemLineDetail'."),
  SalesItemLineDetail: z.object({
    ItemRef: z
      .object({ value: z.string() })
      .describe("Reference to the item. Get the ID from search_items or search_actions."),
    Qty: z.number().min(1).describe("Quantity."),
    UnitPrice: z.number().describe("Price per unit."),
  }),
});

const inputSchema = {
  CustomerRef: z
    .object({ value: z.string() })
    .describe(
      "Reference to the customer. Get the ID from search_customers first.",
    ),
  Line: z
    .array(lineItemSchema)
    .min(1)
    .describe("Invoice line items. At least one required."),
  DocNumber: z
    .string()
    .optional()
    .describe("Custom document number. Auto-generated if omitted."),
  TxnDate: z
    .string()
    .optional()
    .describe("Transaction date in YYYY-MM-DD format. Defaults to today."),
  DueDate: z
    .string()
    .optional()
    .describe("Payment due date in YYYY-MM-DD format."),
  PrivateNote: z
    .string()
    .optional()
    .describe("Internal note (not shown to customer)."),
};

export function registerCreateInvoice(server: McpServer) {
  server.registerTool(
    "create_invoice",
    {
      description:
        "Create an invoice in QuickBooks Online. Requires a customer reference and at least one line item. Search for customer and item IDs first using search_customers and search_actions → search_items. Returns the created invoice with its ID and calculated totals.",
      inputSchema,
      annotations: { openWorldHint: true },
    },
    async (params) => {
      try {
        const result = await executeCreate("invoice", params);
        return {
          content: [
            {
              type: "text" as const,
              text: `Invoice created (ID: ${result.Id}, DocNumber: ${result.DocNumber ?? "auto"}, Total: $${result.TotalAmt}):`,
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
              text: `Error creating invoice: ${formatError(error)}. Verify CustomerRef and ItemRef IDs are valid — use search_customers and execute_action with search_items.`,
            },
          ],
        };
      }
    },
  );
}
```

- [ ] **Step 2: Build and verify**

Run: `bun run build`
Expected: Clean compilation.

- [ ] **Step 3: Commit**

```bash
git add src/tools/promoted/create-invoice.tool.ts
git commit -m "feat: add promoted create_invoice tool with rich schema"
```

---

### Task 11: Promoted Tools — search_invoices and search_accounts

**Files:**
- Create: `src/tools/promoted/search-invoices.tool.ts`
- Create: `src/tools/promoted/search-accounts.tool.ts`

- [ ] **Step 1: Write the promoted search_invoices tool**

```typescript
// src/tools/promoted/search-invoices.tool.ts
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { executeSearch } from "../handlers/generic-handler.js";
import { formatError } from "../helpers/format-error.js";

const inputSchema = {
  criteria: z
    .array(
      z.object({
        field: z
          .enum([
            "Id",
            "DocNumber",
            "TxnDate",
            "DueDate",
            "CustomerRef",
            "Balance",
            "TotalAmt",
            "MetaData.CreateTime",
            "MetaData.LastUpdatedTime",
          ])
          .describe("Invoice field to filter on."),
        value: z.union([z.string(), z.number()]).describe("Value to match."),
        operator: z
          .enum(["=", "<", ">", "<=", ">=", "LIKE", "IN"])
          .default("=")
          .describe("Comparison operator."),
      }),
    )
    .optional()
    .describe("Filters to apply. Omit for all invoices."),
  limit: z.number().int().min(1).max(1000).default(100).describe("Max results."),
  offset: z.number().int().min(0).default(0).describe("Skip N results."),
  asc: z.string().optional().describe("Sort ascending by field."),
  desc: z.string().optional().describe("Sort descending by field."),
};

export function registerSearchInvoices(server: McpServer) {
  server.registerTool(
    "search_invoices",
    {
      description:
        "Search invoices in QuickBooks Online. Returns invoice records with IDs, doc numbers, dates, line items, totals, and balances. Use this to find invoices by customer, date range, or amount. Does NOT search estimates or bills — use search_actions for those.",
      inputSchema,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ criteria, limit, offset, asc, desc }) => {
      try {
        const searchPayload: any[] = [
          ...(criteria ?? []).map((c) => ({ field: c.field, value: c.value, operator: c.operator })),
        ];
        if (limit) searchPayload.push({ field: "limit", value: limit });
        if (offset) searchPayload.push({ field: "offset", value: offset });
        if (asc) searchPayload.push({ field: "asc", value: asc });
        if (desc) searchPayload.push({ field: "desc", value: desc });

        const results = await executeSearch("invoice", searchPayload.length > 0 ? searchPayload : {});
        return {
          content: [
            { type: "text" as const, text: `Found ${results.length} invoice(s):` },
            { type: "text" as const, text: JSON.stringify(results, null, 2) },
          ],
        };
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: `Error searching invoices: ${formatError(error)}` }],
        };
      }
    },
  );
}
```

- [ ] **Step 2: Write the promoted search_accounts tool**

```typescript
// src/tools/promoted/search-accounts.tool.ts
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { executeSearch } from "../handlers/generic-handler.js";
import { formatError } from "../helpers/format-error.js";

const inputSchema = {
  criteria: z
    .array(
      z.object({
        field: z
          .enum([
            "Id",
            "Name",
            "AccountType",
            "Classification",
            "Active",
            "CurrentBalance",
            "MetaData.CreateTime",
            "MetaData.LastUpdatedTime",
          ])
          .describe("Account field to filter on."),
        value: z.union([z.string(), z.number(), z.boolean()]).describe("Value to match."),
        operator: z
          .enum(["=", "<", ">", "<=", ">=", "LIKE", "IN"])
          .default("=")
          .describe("Comparison operator."),
      }),
    )
    .optional()
    .describe("Filters to apply. Omit for full chart of accounts."),
  limit: z.number().int().min(1).max(1000).default(100).describe("Max results."),
  offset: z.number().int().min(0).default(0).describe("Skip N results."),
};

export function registerSearchAccounts(server: McpServer) {
  server.registerTool(
    "search_accounts",
    {
      description:
        "Search the chart of accounts in QuickBooks Online. Returns account records with IDs, names, types, classifications, and balances. Use this to find account IDs needed for journal entries and purchases.",
      inputSchema,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ criteria, limit, offset }) => {
      try {
        const searchPayload: any[] = [
          ...(criteria ?? []).map((c) => ({ field: c.field, value: c.value, operator: c.operator })),
        ];
        if (limit) searchPayload.push({ field: "limit", value: limit });
        if (offset) searchPayload.push({ field: "offset", value: offset });

        const results = await executeSearch("account", searchPayload.length > 0 ? searchPayload : {});
        return {
          content: [
            { type: "text" as const, text: `Found ${results.length} account(s):` },
            { type: "text" as const, text: JSON.stringify(results, null, 2) },
          ],
        };
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: `Error searching accounts: ${formatError(error)}` }],
        };
      }
    },
  );
}
```

- [ ] **Step 3: Build and verify**

Run: `bun run build`
Expected: Clean compilation.

- [ ] **Step 4: Commit**

```bash
git add src/tools/promoted/search-invoices.tool.ts src/tools/promoted/search-accounts.tool.ts
git commit -m "feat: add promoted search_invoices and search_accounts tools"
```

---

## Phase 4: Rewire and Clean Up

### Task 12: Rewrite index.ts

Replace the 50-tool registration with 7 tools: 2 catalog + 5 promoted.

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Rewrite index.ts**

```typescript
#!/usr/bin/env node
// src/index.ts

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
```

- [ ] **Step 2: Build and verify**

Run: `bun run build`
Expected: Clean compilation. Warnings about unused old files are expected and will be cleaned up next.

- [ ] **Step 3: Commit**

```bash
git add src/index.ts
git commit -m "feat: rewire index.ts to 7 tools (2 catalog + 5 promoted)"
```

---

### Task 13: Delete Old Files

Remove the 50 old tool files, 50 old handler files, and the now-unused RegisterTool helper and ToolDefinition type.

**Files:**
- Delete: all files in `src/tools/` except the new ones
- Delete: all files in `src/handlers/` except `generic-handler.ts`
- Delete: `src/helpers/register-tool.ts`
- Delete: `src/types/tool-definition.ts`

- [ ] **Step 1: Delete old tool files**

```bash
# Delete all old tool files (the new ones are in src/tools/promoted/ and the root new ones)
rm src/tools/create-account.tool.ts \
   src/tools/create-bill-payment.tool.ts \
   src/tools/create-bill.tool.ts \
   src/tools/create-customer.tool.ts \
   src/tools/create-employee.tool.ts \
   src/tools/create-estimate.tool.ts \
   src/tools/create-invoice.tool.ts \
   src/tools/create-item.tool.ts \
   src/tools/create-journal-entry.tool.ts \
   src/tools/create-purchase.tool.ts \
   src/tools/create-vendor.tool.ts \
   src/tools/delete-bill-payment.tool.ts \
   src/tools/delete-bill.tool.ts \
   src/tools/delete-customer.tool.ts \
   src/tools/delete-estimate.tool.ts \
   src/tools/delete-journal-entry.tool.ts \
   src/tools/delete-purchase.tool.ts \
   src/tools/delete-vendor.tool.ts \
   src/tools/get-bill-payment.tool.ts \
   src/tools/get-bill.tool.ts \
   src/tools/get-customer.tool.ts \
   src/tools/get-employee.tool.ts \
   src/tools/get-estimate.tool.ts \
   src/tools/get-journal-entry.tool.ts \
   src/tools/get-purchase.tool.ts \
   src/tools/get-vendor.tool.ts \
   src/tools/read-invoice.tool.ts \
   src/tools/read-item.tool.ts \
   src/tools/search-accounts.tool.ts \
   src/tools/search-bill-payments.tool.ts \
   src/tools/search-bills.tool.ts \
   src/tools/search-customers.tool.ts \
   src/tools/search-employees.tool.ts \
   src/tools/search-estimates.tool.ts \
   src/tools/search-invoices.tool.ts \
   src/tools/search-items.tool.ts \
   src/tools/search-journal-entries.tool.ts \
   src/tools/search-purchases.tool.ts \
   src/tools/search-vendors.tool.ts \
   src/tools/update-account.tool.ts \
   src/tools/update-bill-payment.tool.ts \
   src/tools/update-bill.tool.ts \
   src/tools/update-customer.tool.ts \
   src/tools/update-employee.tool.ts \
   src/tools/update-estimate.tool.ts \
   src/tools/update-invoice.tool.ts \
   src/tools/update-item.tool.ts \
   src/tools/update-journal-entry.tool.ts \
   src/tools/update-purchase.tool.ts \
   src/tools/update-vendor.tool.ts
```

- [ ] **Step 2: Delete old handler files**

```bash
rm src/handlers/create-quickbooks-account.handler.ts \
   src/handlers/create-quickbooks-bill-payment.handler.ts \
   src/handlers/create-quickbooks-bill.handler.ts \
   src/handlers/create-quickbooks-customer.handler.ts \
   src/handlers/create-quickbooks-employee.handler.ts \
   src/handlers/create-quickbooks-estimate.handler.ts \
   src/handlers/create-quickbooks-invoice.handler.ts \
   src/handlers/create-quickbooks-item.handler.ts \
   src/handlers/create-quickbooks-journal-entry.handler.ts \
   src/handlers/create-quickbooks-purchase.handler.ts \
   src/handlers/create-quickbooks-vendor.handler.ts \
   src/handlers/delete-quickbooks-bill-payment.handler.ts \
   src/handlers/delete-quickbooks-bill.handler.ts \
   src/handlers/delete-quickbooks-customer.handler.ts \
   src/handlers/delete-quickbooks-estimate.handler.ts \
   src/handlers/delete-quickbooks-journal-entry.handler.ts \
   src/handlers/delete-quickbooks-purchase.handler.ts \
   src/handlers/delete-quickbooks-vendor.handler.ts \
   src/handlers/get-quickbooks-bill-payment.handler.ts \
   src/handlers/get-quickbooks-bill.handler.ts \
   src/handlers/get-quickbooks-customer.handler.ts \
   src/handlers/get-quickbooks-employee.handler.ts \
   src/handlers/get-quickbooks-estimate.handler.ts \
   src/handlers/get-quickbooks-journal-entry.handler.ts \
   src/handlers/get-quickbooks-purchase.handler.ts \
   src/handlers/get-quickbooks-vendor.handler.ts \
   src/handlers/read-quickbooks-invoice.handler.ts \
   src/handlers/read-quickbooks-item.handler.ts \
   src/handlers/search-quickbooks-accounts.handler.ts \
   src/handlers/search-quickbooks-bill-payments.handler.ts \
   src/handlers/search-quickbooks-bills.handler.ts \
   src/handlers/search-quickbooks-customers.handler.ts \
   src/handlers/search-quickbooks-employees.handler.ts \
   src/handlers/search-quickbooks-estimates.handler.ts \
   src/handlers/search-quickbooks-invoices.handler.ts \
   src/handlers/search-quickbooks-items.handler.ts \
   src/handlers/search-quickbooks-journal-entries.handler.ts \
   src/handlers/search-quickbooks-purchases.handler.ts \
   src/handlers/search-quickbooks-vendors.handler.ts \
   src/handlers/update-quickbooks-account.handler.ts \
   src/handlers/update-quickbooks-bill-payment.handler.ts \
   src/handlers/update-quickbooks-bill.handler.ts \
   src/handlers/update-quickbooks-customer.handler.ts \
   src/handlers/update-quickbooks-employee.handler.ts \
   src/handlers/update-quickbooks-estimate.handler.ts \
   src/handlers/update-quickbooks-invoice.handler.ts \
   src/handlers/update-quickbooks-item.handler.ts \
   src/handlers/update-quickbooks-journal-entry.handler.ts \
   src/handlers/update-quickbooks-purchase.handler.ts \
   src/handlers/update-quickbooks-vendor.handler.ts
```

- [ ] **Step 3: Delete unused helper and type**

```bash
rm src/helpers/register-tool.ts src/types/tool-definition.ts
```

- [ ] **Step 4: Build and verify**

Run: `bun run build`
Expected: Clean compilation with zero errors. All imports should resolve to new files.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: remove 100 old tool/handler files replaced by catalog architecture"
```

---

### Task 14: Final Build and Smoke Test

**Files:** None (verification only)

- [ ] **Step 1: Clean build**

```bash
rm -rf dist && bun run build
```

Expected: Clean compilation, `dist/` populated.

- [ ] **Step 2: Verify tool list with MCP Inspector**

```bash
npx @modelcontextprotocol/inspector --cli node dist/index.js \
  --transport stdio --method tools/list
```

Expected: Exactly 7 tools listed:
1. `search_actions`
2. `execute_action`
3. `search_customers`
4. `create_customer`
5. `create_invoice`
6. `search_invoices`
7. `search_accounts`

All should have descriptions, inputSchema, and annotations.

- [ ] **Step 3: Verify server instructions**

```bash
npx @modelcontextprotocol/inspector --cli node dist/index.js \
  --transport stdio --method initialize
```

Expected: Response includes `instructions` field with QuickBooks usage guidance.

- [ ] **Step 4: Commit final state**

```bash
git add -A
git commit -m "chore: verify clean build with 7-tool architecture"
```

---

## Out of Scope (Future Plans)

These items are real best-practice gaps but warrant separate plans:

1. **Auth hardening** — Move token storage from plaintext `.env` to OS keychain (`keytar`). The current `saveTokensToEnv()` in `quickbooks-client.ts` writes secrets to disk in cleartext.

2. **Structured output** — Add `outputSchema` and `structuredContent` to all 7 tools so clients can validate responses programmatically.

3. **Remote HTTP transport** — Add Streamable HTTP alongside stdio for zero-install remote usage. This would enable listing in the MCP connector directory.

4. **Tests** — Unit tests for `generic-handler.ts` (mock QB client), `action-catalog.ts` (search ranking), and integration tests for the promoted tools.

5. **Logging/Progress** — Add MCP-native logging in the generic handler and progress reporting for search operations that return large result sets.
