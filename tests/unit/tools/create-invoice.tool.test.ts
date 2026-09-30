import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { mockQuickbooksClient, mockQuickbooksClientClass, mockQuickBooksInstance, resetAllMocks } from '../../mocks/quickbooks.mock';

jest.unstable_mockModule('../../../src/clients/quickbooks-client', () => ({
  quickbooksClient: mockQuickbooksClient,
  QuickbooksClient: mockQuickbooksClientClass,
}));

const { CreateInvoiceTool } = await import('../../../src/tools/create-invoice.tool');

const base = { customer_ref: '42', line_items: [{ item_ref: '1', qty: 1, unit_price: 100 }] };

describe('create_invoice private_note', () => {
  beforeEach(() => {
    resetAllMocks();
  });

  it('is declared by the schema, so it is not stripped as an unsupported parameter', () => {
    const parsed = CreateInvoiceTool.schema.safeParse({ ...base, private_note: 'internal' });
    expect(parsed.success).toBe(true);
    expect((parsed as any).data.private_note).toBe('internal');
  });

  it('rejects an empty private_note', () => {
    expect(CreateInvoiceTool.schema.safeParse({ ...base, private_note: '' }).success).toBe(false);
  });

  it('reaches QBO as PrivateNote through the tool handler', async () => {
    mockQuickBooksInstance.createInvoice.mockImplementation((_payload: any, cb: any) => cb(null, { Id: '1' }));

    await (CreateInvoiceTool.handler as any)({ params: { ...base, private_note: 'internal' } });

    const payload = mockQuickBooksInstance.createInvoice.mock.calls[0][0] as any;
    expect(payload.PrivateNote).toBe('internal');
    expect(payload.CustomerMemo).toBeUndefined();
  });

  it('reports a QBO error', async () => {
    mockQuickBooksInstance.createInvoice.mockImplementation((_payload: any, cb: any) => cb(new Error('QBO fault'), null));

    const result = await (CreateInvoiceTool.handler as any)({ params: { ...base, private_note: 'internal' } });

    expect(result.content[0].text).toBe('Error creating invoice: Error: QBO fault');
  });
});
