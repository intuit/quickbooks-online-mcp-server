import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { mockQuickbooksClient, mockQuickbooksClientClass, mockQuickBooksInstance, resetAllMocks } from '../../mocks/quickbooks.mock';

// ESM-compatible module mocking
jest.unstable_mockModule('../../../src/clients/quickbooks-client', () => ({
  quickbooksClient: mockQuickbooksClient,
  QuickbooksClient: mockQuickbooksClientClass,
}));

const { createQuickbooksInvoice } = await import('../../../src/handlers/create-quickbooks-invoice.handler');

describe('Create Invoice Handler - LinkedTxn', () => {
  beforeEach(() => {
    resetAllMocks();
  });

  it('should create an invoice with LinkedTxn when linked_txn is provided', async () => {
    const mockInvoice = { Id: '789', TotalAmt: 500, LinkedTxn: [{ TxnId: '123', TxnType: 'Estimate' }] };
    mockQuickBooksInstance.createInvoice.mockImplementation((_payload: any, cb: any) => cb(null, mockInvoice));

    const result = await createQuickbooksInvoice({
      customer_ref: '42',
      line_items: [{ item_ref: '1', qty: 5, unit_price: 100 }],
      linked_txn: [{ txn_id: '123', txn_type: 'Estimate' }],
    });

    expect(result.isError).toBe(false);
    expect(result.result).toEqual(mockInvoice);

    const payload = mockQuickBooksInstance.createInvoice.mock.calls[0][0] as any;
    expect(payload.LinkedTxn).toEqual([{ TxnId: '123', TxnType: 'Estimate' }]);
  });

  it('should not include LinkedTxn when linked_txn is omitted', async () => {
    const mockInvoice = { Id: '790', TotalAmt: 200 };
    mockQuickBooksInstance.createInvoice.mockImplementation((_payload: any, cb: any) => cb(null, mockInvoice));

    const result = await createQuickbooksInvoice({
      customer_ref: '42',
      line_items: [{ item_ref: '2', qty: 2, unit_price: 100 }],
    });

    expect(result.isError).toBe(false);
    const payload = mockQuickBooksInstance.createInvoice.mock.calls[0][0] as any;
    expect(payload.LinkedTxn).toBeUndefined();
  });

  it('should support multiple linked transactions', async () => {
    const mockInvoice = { Id: '791', TotalAmt: 300 };
    mockQuickBooksInstance.createInvoice.mockImplementation((_payload: any, cb: any) => cb(null, mockInvoice));

    const result = await createQuickbooksInvoice({
      customer_ref: '42',
      line_items: [{ item_ref: '1', qty: 3, unit_price: 100 }],
      linked_txn: [
        { txn_id: '100', txn_type: 'Estimate' },
        { txn_id: '200', txn_type: 'Payment' },
      ],
    });

    expect(result.isError).toBe(false);
    const payload = mockQuickBooksInstance.createInvoice.mock.calls[0][0] as any;
    expect(payload.LinkedTxn).toHaveLength(2);
    expect(payload.LinkedTxn[0]).toEqual({ TxnId: '100', TxnType: 'Estimate' });
    expect(payload.LinkedTxn[1]).toEqual({ TxnId: '200', TxnType: 'Payment' });
  });
});
