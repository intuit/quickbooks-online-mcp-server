import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { mockQuickbooksClient, mockQuickbooksClientClass, mockQuickBooksInstance, resetAllMocks } from '../../mocks/quickbooks.mock';

// ESM-compatible module mocking
jest.unstable_mockModule('../../../src/clients/quickbooks-client', () => ({
  quickbooksClient: mockQuickbooksClient,
  QuickbooksClient: mockQuickbooksClientClass,
}));

const { createQuickbooksInvoice } = await import('../../../src/handlers/create-quickbooks-invoice.handler');

describe('Create Invoice Handler - template fields', () => {
  beforeEach(() => {
    resetAllMocks();
  });

  it('should map customer_memo, sales_term_ref and bill_email to QBO properties', async () => {
    const mockInvoice = { Id: '801', TotalAmt: 100 };
    mockQuickBooksInstance.createInvoice.mockImplementation((_payload: any, cb: any) => cb(null, mockInvoice));

    const result = await createQuickbooksInvoice({
      customer_ref: '42',
      line_items: [{ item_ref: '1', qty: 1, unit_price: 100 }],
      customer_memo: 'Interest of 2% per month applies to overdue invoices.',
      sales_term_ref: '3',
      bill_email: 'billing@example.com',
    });

    expect(result.isError).toBe(false);
    const payload = mockQuickBooksInstance.createInvoice.mock.calls[0][0] as any;
    expect(payload.CustomerMemo).toEqual({ value: 'Interest of 2% per month applies to overdue invoices.' });
    expect(payload.SalesTermRef).toEqual({ value: '3' });
    expect(payload.BillEmail).toEqual({ Address: 'billing@example.com' });
  });

  it('should map private_note to PrivateNote and keep it out of CustomerMemo', async () => {
    const mockInvoice = { Id: '804', TotalAmt: 100 };
    mockQuickBooksInstance.createInvoice.mockImplementation((_payload: any, cb: any) => cb(null, mockInvoice));

    const result = await createQuickbooksInvoice({
      customer_ref: '42',
      line_items: [{ item_ref: '1', qty: 1, unit_price: 100 }],
      customer_memo: 'Thank you for your business.',
      private_note: 'AI-generated draft - reviewed by JM',
    });

    expect(result.isError).toBe(false);
    const payload = mockQuickBooksInstance.createInvoice.mock.calls[0][0] as any;
    expect(payload.PrivateNote).toBe('AI-generated draft - reviewed by JM');
    expect(payload.CustomerMemo).toEqual({ value: 'Thank you for your business.' });
  });

  it('should map per-line service_date to SalesItemLineDetail.ServiceDate', async () => {
    const mockInvoice = { Id: '802', TotalAmt: 200 };
    mockQuickBooksInstance.createInvoice.mockImplementation((_payload: any, cb: any) => cb(null, mockInvoice));

    const result = await createQuickbooksInvoice({
      customer_ref: '42',
      line_items: [
        { item_ref: '1', qty: 1, unit_price: 100, service_date: '2026-06-16' },
        { item_ref: '1', qty: 1, unit_price: 100, service_date: '2026-06-18' },
      ],
    });

    expect(result.isError).toBe(false);
    const payload = mockQuickBooksInstance.createInvoice.mock.calls[0][0] as any;
    expect(payload.Line[0].SalesItemLineDetail.ServiceDate).toBe('2026-06-16');
    expect(payload.Line[1].SalesItemLineDetail.ServiceDate).toBe('2026-06-18');
  });

  it('should omit the template fields when not provided', async () => {
    const mockInvoice = { Id: '803', TotalAmt: 100 };
    mockQuickBooksInstance.createInvoice.mockImplementation((_payload: any, cb: any) => cb(null, mockInvoice));

    const result = await createQuickbooksInvoice({
      customer_ref: '42',
      line_items: [{ item_ref: '1', qty: 1, unit_price: 100 }],
    });

    expect(result.isError).toBe(false);
    const payload = mockQuickBooksInstance.createInvoice.mock.calls[0][0] as any;
    expect(payload.CustomerMemo).toBeUndefined();
    expect(payload.SalesTermRef).toBeUndefined();
    expect(payload.BillEmail).toBeUndefined();
    expect(payload).not.toHaveProperty('PrivateNote');
    expect(payload.Line[0].SalesItemLineDetail.ServiceDate).toBeUndefined();
  });
});
