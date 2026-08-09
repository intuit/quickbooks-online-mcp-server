# Changelog

All notable changes to the QuickBooks Online MCP Server are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.0.1] - 2024-01-13

### Summary

Comprehensive expansion of the QuickBooks Online MCP server from a basic implementation to a full-featured API integration with **143 tools**, **29 entity types**, **11 financial reports**, and **100% test coverage**.

---

### Added

#### Entity Handlers (Full CRUD Operations)

Extended the server with complete Create, Read, Update, Delete, and Search operations for 29 entity types:

**Financial Transactions**
- `Payment` - Customer payment recording and management
- `SalesReceipt` - Point-of-sale transaction records
- `CreditMemo` - Customer credit adjustments
- `RefundReceipt` - Customer refund processing
- `Deposit` - Bank deposit recording with line item support
- `Transfer` - Inter-account fund transfers
- `PurchaseOrder` - Vendor purchase orders with shipping addresses
- `VendorCredit` - Vendor credit adjustments

**Time & Activity**
- `TimeActivity` - Employee/vendor time tracking with billable status

**Organization**
- `Class` - Transaction classification (cost centers)
- `Department` - Departmental organization
- `Term` - Payment terms (Net 30, Due on Receipt, etc.)
- `PaymentMethod` - Payment method types (Cash, Check, Credit Card)

**Tax Entities (Read-only)**
- `TaxCode` - Tax code lookup and search
- `TaxRate` - Tax rate lookup and search
- `TaxAgency` - Tax agency lookup and search

**Company & Attachments**
- `CompanyInfo` - Company profile management with address support
- `Attachable` - File attachment management

#### Financial Reports

Added 11 financial report endpoints:

| Report | Handler | Description |
|--------|---------|-------------|
| Balance Sheet | `get-quickbooks-balance-sheet.handler.ts` | Assets, liabilities, and equity snapshot |
| Profit & Loss | `get-quickbooks-profit-and-loss.handler.ts` | Income statement with accounting method options |
| Cash Flow | `get-quickbooks-cash-flow.handler.ts` | Statement of cash flows |
| Trial Balance | `get-quickbooks-trial-balance.handler.ts` | Debit/credit balance verification |
| General Ledger | `get-quickbooks-general-ledger.handler.ts` | Complete transaction history |
| Customer Sales | `get-quickbooks-customer-sales.handler.ts` | Sales analysis by customer |
| Customer Balance | `get-quickbooks-customer-balance.handler.ts` | Outstanding customer balances |
| Aged Receivables | `get-quickbooks-aged-receivables.handler.ts` | AR aging with customer filter |
| Aged Receivables Detail | `get-quickbooks-aged-receivables-detail.handler.ts` | Detailed AR aging breakdown |
| Aged Payables | `get-quickbooks-aged-payables.handler.ts` | AP aging analysis |
| Vendor Expenses | `get-quickbooks-vendor-expenses.handler.ts` | Expense analysis by vendor |

#### Testing Infrastructure

**Jest Configuration with ESM Support**
- Configured Jest with `--experimental-vm-modules` for native ESM testing
- Set up `ts-jest` with ESM preset for TypeScript compilation
- Created `tsconfig.test.json` for test-specific TypeScript settings

**Mock System**
- Created `tests/mocks/quickbooks.mock.ts` with comprehensive QuickBooks client mocking
- Implemented `mockQuickBooksInstance` with all API method stubs
- Added `resetAllMocks()` helper for test isolation

**Test Suites (335 tests total)**
- `class.handlers.test.ts` - Class entity CRUD tests
- `company-attachable.handlers.test.ts` - Company info and attachable tests
- `credit-memo.handlers.test.ts` - Credit memo CRUD tests
- `department-term-paymentmethod.handlers.test.ts` - Settings entity tests
- `deposit-transfer.handlers.test.ts` - Banking transaction tests
- `payment.handlers.test.ts` - Payment CRUD tests
- `refund-purchase-order-vendor-credit.handlers.test.ts` - Vendor transaction tests
- `reports.handlers.test.ts` - All 11 financial report tests
- `sales-receipt.handlers.test.ts` - Sales receipt CRUD tests
- `tax-entities.handlers.test.ts` - Tax entity read/search tests
- `time-activity.handlers.test.ts` - Time tracking tests
- `format-error.test.ts` - Error formatting helper tests

#### Documentation

- Comprehensive `README.md` with:
  - Badge indicators (143 tools, 29 entities, 11 reports)
  - Complete tool reference with collapsible sections
  - Quick start guide with installation instructions
  - Claude Code MCP configuration examples
  - Authentication setup guide (OAuth 2.0)
  - Project structure documentation

---

### Technical Implementation Details

#### Handler Architecture Pattern

Each handler follows a consistent pattern:

```typescript
// 1. Import dependencies
import { quickbooksClient } from "../clients/quickbooks-client.js";
import { ToolResponse } from "../types/tool-response.js";
import { formatError } from "../helpers/format-error.js";

// 2. Define typed input interface
export interface CreateEntityInput {
  required_field: string;
  optional_field?: string;
}

// 3. Implement async handler with error handling
export async function createQuickbooksEntity(data: CreateEntityInput): Promise<ToolResponse<any>> {
  try {
    await quickbooksClient.authenticate();
    const quickbooks = quickbooksClient.getQuickbooks();

    // Build payload with conditional field mapping
    const payload: any = { RequiredField: data.required_field };
    if (data.optional_field) payload.OptionalField = data.optional_field;

    // Execute QuickBooks API call with callback wrapper
    return new Promise((resolve) => {
      quickbooks.createEntity(payload, (err: any, result: any) => {
        if (err) resolve({ result: null, isError: true, error: formatError(err) });
        else resolve({ result, isError: false, error: null });
      });
    });
  } catch (error) {
    return { result: null, isError: true, error: formatError(error) };
  }
}
```

#### ESM Testing Pattern

Tests use dynamic imports after mock setup for ESM compatibility:

```typescript
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { mockQuickbooksClient, mockQuickBooksInstance, resetAllMocks } from '../../mocks/quickbooks.mock';

// Mock MUST be defined before dynamic imports
jest.unstable_mockModule('../../../src/clients/quickbooks-client', () => ({
  quickbooksClient: mockQuickbooksClient,
}));

// Dynamic import AFTER mock setup
const { createEntity } = await import('../../../src/handlers/create-entity.handler');

describe('Entity Handlers', () => {
  beforeEach(() => {
    resetAllMocks(); // Reset all mock state between tests
  });

  it('should create entity successfully', async () => {
    mockQuickBooksInstance.createEntity.mockImplementation((payload, cb) =>
      cb(null, { Id: '123' })
    );

    const result = await createEntity({ required_field: 'value' });

    expect(result.isError).toBe(false);
    expect(result.result).toEqual({ Id: '123' });
  });
});
```

#### Branch Coverage Strategy

Achieved 100% branch coverage by testing:

1. **Success paths** - Normal API responses
2. **API error paths** - QuickBooks API returning errors via callback
3. **Authentication error paths** - Token refresh/auth failures
4. **Optional field variations** - Testing with and without optional fields
5. **Empty response handling** - QueryResponse with missing entity arrays

Example of branch coverage for optional fields:

```typescript
// Handler code with branches:
if (data.company_addr) {
  payload.CompanyAddr = {};
  if (data.company_addr.line1) payload.CompanyAddr.Line1 = data.company_addr.line1;  // Branch A
  if (data.company_addr.city) payload.CompanyAddr.City = data.company_addr.city;      // Branch B
}

// Tests to cover all branches:
it('should update with line1 only', async () => {
  await updateCompanyInfo({ id: '1', sync_token: '0', company_addr: { line1: '123 Main' } });
});

it('should update with city only', async () => {
  await updateCompanyInfo({ id: '1', sync_token: '0', company_addr: { city: 'LA' } });
});
```

---

### Configuration Changes

#### jest.config.js

```javascript
export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  coverageThreshold: {
    global: {
      branches: 100,
      functions: 100,
      lines: 100,
      statements: 100,
    },
  },
  // ESM support
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
};
```

#### package.json (test script)

```json
{
  "scripts": {
    "test": "NODE_OPTIONS='--experimental-vm-modules' jest"
  }
}
```

---

### Coverage Statistics

| Metric | Coverage |
|--------|----------|
| Statements | 100% |
| Branches | 100% |
| Functions | 100% |
| Lines | 100% |

**Test Summary:**
- 12 test suites
- 335 tests
- 0 snapshots
- ~8 seconds execution time

---

### File Structure

```
mcp-quickbooks-online/
├── src/
│   ├── clients/
│   │   └── quickbooks-client.ts      # OAuth client wrapper
│   ├── handlers/                      # 87 handler files
│   │   ├── create-quickbooks-*.ts    # Create operations
│   │   ├── get-quickbooks-*.ts       # Read operations
│   │   ├── update-quickbooks-*.ts    # Update operations
│   │   ├── delete-quickbooks-*.ts    # Delete operations
│   │   └── search-quickbooks-*.ts    # Search operations
│   ├── tools/                         # MCP tool definitions
│   ├── helpers/
│   │   └── format-error.ts           # Error formatting utility
│   ├── types/
│   │   └── tool-response.ts          # Response type definitions
│   └── index.ts                       # MCP server entry point
├── tests/
│   ├── mocks/
│   │   └── quickbooks.mock.ts        # QuickBooks client mock
│   └── unit/
│       ├── handlers/                  # 11 handler test files
│       └── helpers/                   # Helper tests
├── jest.config.js                     # Jest ESM configuration
├── tsconfig.test.json                # Test TypeScript config
├── README.md                          # Comprehensive documentation
└── CHANGELOG.md                       # This file
```

---

### Why These Changes Were Made

1. **Complete API Coverage**: The original Intuit repo provided basic functionality. This expansion provides access to all QuickBooks Online API capabilities needed for real accounting workflows.

2. **Test Coverage**: 100% test coverage ensures reliability and catches regressions. The ESM testing pattern enables modern JavaScript module testing.

3. **Type Safety**: TypeScript interfaces for all inputs provide compile-time validation and better IDE support.

4. **Consistent Patterns**: All handlers follow the same architecture, making the codebase maintainable and predictable.

5. **Error Handling**: Standardized error formatting through `formatError()` provides consistent error messages across all operations.

---

### Migration Notes

If upgrading from the original Intuit implementation:

1. All original functionality is preserved
2. New handlers use the same client and authentication
3. Tool names follow the pattern `{action}_{entity}` (e.g., `create_payment`)
4. All tools return `ToolResponse<T>` with `isError`, `result`, and `error` fields

---

## [Unreleased]

### Fixed

- Rotated refresh tokens are now persisted to a `tokens.json` sidecar file (in addition to `.env`), so env-var-based deployments (Docker, MCP host `env` config blocks) don't silently lose token rotation on restart. Override the sidecar location with `QUICKBOOKS_TOKEN_STORE_PATH`. (#117)

### Planned

- Integration tests with QuickBooks sandbox
- Batch operation support
- Webhook handling for real-time updates
- Report export to CSV/PDF formats
