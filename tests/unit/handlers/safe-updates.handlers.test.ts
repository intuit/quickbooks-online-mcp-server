import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { mockQuickbooksClient, mockQuickbooksClientClass, mockQuickBooksInstance, resetAllMocks } from '../../mocks/quickbooks.mock';

jest.unstable_mockModule('../../../src/clients/quickbooks-client', () => ({
  quickbooksClient: mockQuickbooksClient,
  QuickbooksClient: mockQuickbooksClientClass,
}));

const { updateQuickbooksCustomer } = await import('../../../src/handlers/update-quickbooks-customer.handler');
const { updateQuickbooksVendor } = await import('../../../src/handlers/update-quickbooks-vendor.handler');
const { updateQuickbooksEmployee } = await import('../../../src/handlers/update-quickbooks-employee.handler');
const { updateQuickbooksPurchase } = await import('../../../src/handlers/update-quickbooks-purchase.handler');
const { updateQuickbooksBillPayment } = await import('../../../src/handlers/update-quickbooks-bill-payment.handler');
const { updateQuickbooksJournalEntry } = await import('../../../src/handlers/update-quickbooks-journal-entry.handler');
const { UpdateCustomerTool } = await import('../../../src/tools/update-customer.tool');
const { UpdateVendorTool } = await import('../../../src/tools/update-vendor.tool');
const { UpdateEmployeeTool } = await import('../../../src/tools/update-employee.tool');
const { UpdatePurchaseTool } = await import('../../../src/tools/update-purchase.tool');
const { UpdateBillPaymentTool } = await import('../../../src/tools/update-bill-payment.tool');
const { UpdateJournalEntryTool } = await import('../../../src/tools/update-journal-entry.tool');

const cases: Array<{
  label: string;
  idKey: string;
  get: string;
  update: string;
  handler: (input: any) => Promise<any>;
  tool: any;
  errorText: string;
  successText: string | null;
}> = [
  { label: 'customer', idKey: 'customer_id', get: 'getCustomer', update: 'updateCustomer', handler: updateQuickbooksCustomer, tool: UpdateCustomerTool, errorText: 'Error updating customer', successText: 'Customer updated' },
  { label: 'vendor', idKey: 'vendor_id', get: 'getVendor', update: 'updateVendor', handler: updateQuickbooksVendor, tool: UpdateVendorTool, errorText: 'Error updating vendor', successText: null },
  { label: 'employee', idKey: 'employee_id', get: 'getEmployee', update: 'updateEmployee', handler: updateQuickbooksEmployee, tool: UpdateEmployeeTool, errorText: 'Error updating employee', successText: 'Employee updated' },
  { label: 'purchase', idKey: 'purchase_id', get: 'getPurchase', update: 'updatePurchase', handler: updateQuickbooksPurchase, tool: UpdatePurchaseTool, errorText: 'Error updating purchase', successText: 'Purchase updated' },
  { label: 'bill payment', idKey: 'bill_payment_id', get: 'getBillPayment', update: 'updateBillPayment', handler: updateQuickbooksBillPayment, tool: UpdateBillPaymentTool, errorText: 'Error updating bill payment', successText: 'Bill payment updated' },
  { label: 'journal entry', idKey: 'journal_entry_id', get: 'getJournalEntry', update: 'updateJournalEntry', handler: updateQuickbooksJournalEntry, tool: UpdateJournalEntryTool, errorText: 'Error updating journal entry', successText: 'Journal entry updated' },
];

describe.each(cases)('sparse update: $label', ({ idKey, get, update, handler, tool, errorText, successText }) => {
  const getMock = () => (mockQuickBooksInstance as any)[get];
  const updateMock = () => (mockQuickBooksInstance as any)[update];
  const existing = { Id: '9', SyncToken: '3', Notes: 'keep me', Nested: { a: 1 } };

  beforeEach(() => {
    resetAllMocks();
  });

  it('keeps existing fields and sends sparse:true with the fetched SyncToken', async () => {
    getMock().mockImplementation((_id: any, cb: any) => cb(null, existing));
    updateMock().mockImplementation((payload: any, cb: any) => cb(null, { ...payload, SyncToken: '4' }));

    const result = await handler({ [idKey]: '9', patch: { PrivateNote: 'new' } });

    expect(result.isError).toBe(false);
    expect(getMock().mock.calls[0][0]).toBe('9');
    const payload = updateMock().mock.calls[0][0];
    expect(payload).toMatchObject({ Id: '9', SyncToken: '3', sparse: true, PrivateNote: 'new', Notes: 'keep me', Nested: { a: 1 } });
  });

  it('lets a SyncToken in the patch override the fetched one, but not Id or sparse', async () => {
    getMock().mockImplementation((_id: any, cb: any) => cb(null, existing));
    updateMock().mockImplementation((payload: any, cb: any) => cb(null, payload));

    await handler({ [idKey]: '9', patch: { SyncToken: '7', Id: '99', sparse: false } });

    const payload = updateMock().mock.calls[0][0];
    expect(payload.SyncToken).toBe('7');
    expect(payload.Id).toBe('9');
    expect(payload.sparse).toBe(true);
  });

  it('returns an error and never updates when the fetch fails', async () => {
    getMock().mockImplementation((_id: any, cb: any) => cb(new Error('Object Not Found')));

    const result = await handler({ [idKey]: 'nope', patch: {} });

    expect(result.isError).toBe(true);
    expect(result.error).toContain('Object Not Found');
    expect(updateMock()).not.toHaveBeenCalled();
  });

  it('returns an error when the update fails', async () => {
    getMock().mockImplementation((_id: any, cb: any) => cb(null, existing));
    updateMock().mockImplementation((_p: any, cb: any) => cb(new Error('Stale object')));

    const result = await handler({ [idKey]: '9', patch: {} });

    expect(result.isError).toBe(true);
    expect(result.error).toContain('Stale object');
  });

  it('tool schema takes {id, patch} and rejects an empty id', () => {
    expect(tool.schema.safeParse({ [idKey]: '9', patch: { PrivateNote: 'x' } }).success).toBe(true);
    expect(tool.schema.safeParse({ [idKey]: '', patch: {} }).success).toBe(false);
    expect(tool.schema.safeParse({ [idKey]: '9' }).success).toBe(false);
    expect(tool.description).toContain('Changes only the fields you send in `patch`');
    expect(tool.description).toContain('A `Line` array replaces all lines.');
  });

  it('tool handler reports success and failure', async () => {
    getMock().mockImplementation((_id: any, cb: any) => cb(null, existing));
    updateMock().mockImplementation((payload: any, cb: any) => cb(null, { Id: '9' }));
    const ok = await tool.handler({ params: { [idKey]: '9', patch: {} } });
    const text = ok.content.map((c: any) => c.text).join('|');
    expect(text).toContain('"Id":"9"');
    if (successText) expect(text).toContain(successText);

    updateMock().mockImplementation((_p: any, cb: any) => cb(new Error('boom')));
    const bad = await tool.handler({ params: { [idKey]: '9', patch: {} } });
    expect(bad.content[0].text).toContain(errorText);
  });

  it('returns an error when the client cannot be created', async () => {
    (mockQuickbooksClientClass.getInstance as any).mockRejectedValue(new Error('Auth failed'));

    const result = await handler({ [idKey]: '9', patch: {} });

    expect(result.isError).toBe(true);
    expect(result.error).toContain('Auth failed');
  });
});

describe('update-vendor schema', () => {
  it('accepts a patch without DisplayName', () => {
    expect(UpdateVendorTool.schema.safeParse({ vendor_id: '5', patch: { PrimaryPhone: { FreeFormNumber: '555' } } }).success).toBe(true);
  });
});
