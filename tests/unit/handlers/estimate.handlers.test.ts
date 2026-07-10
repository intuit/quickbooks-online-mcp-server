import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { mockQuickBooksInstance, resetAllMocks, mockQuickbooksClient, mockQuickbooksClientClass } from '../../mocks/quickbooks.mock';

jest.unstable_mockModule('../../../src/clients/quickbooks-client', () => ({
  quickbooksClient: mockQuickbooksClient,
  QuickbooksClient: mockQuickbooksClientClass,
}));

const { createQuickbooksEstimate } = await import('../../../src/handlers/create-quickbooks-estimate.handler');

describe('Create Estimate Handler', () => {
  beforeEach(() => resetAllMocks());

  it('maps customer_ref and line_items to a QBO Estimate payload', async () => {
    mockQuickBooksInstance.createEstimate.mockImplementation((_p: any, cb: any) => cb(null, { Id: '900', TotalAmt: 8550 }));

    const result = await createQuickbooksEstimate({
      customer_ref: '77',
      line_items: [{ item_ref: '74', qty: 30, unit_price: 285, description: '[VQ] services-conseils', tax_code_ref: '8' }],
      global_tax_calculation: 'TaxExcluded',
    });

    expect(result.isError).toBe(false);
    const payload = mockQuickBooksInstance.createEstimate.mock.calls[0][0] as any;
    expect(payload.CustomerRef).toEqual({ value: '77' });
    expect(payload.Line[0].Amount).toBe(8550);
    expect(payload.Line[0].SalesItemLineDetail).toMatchObject({ ItemRef: { value: '74' }, Qty: 30, UnitPrice: 285, TaxCodeRef: { value: '8' } });
    expect(payload.GlobalTaxCalculation).toBe('TaxExcluded');
  });

  it('maps customer_memo, sales_term_ref and bill_email', async () => {
    mockQuickBooksInstance.createEstimate.mockImplementation((_p: any, cb: any) => cb(null, { Id: '901' }));

    await createQuickbooksEstimate({
      customer_ref: '77',
      line_items: [{ item_ref: '74', qty: 1, unit_price: 285 }],
      customer_memo: 'Taux valable 2026.',
      sales_term_ref: '3',
      bill_email: 'appro@example.com',
    });

    const payload = mockQuickBooksInstance.createEstimate.mock.calls[0][0] as any;
    expect(payload.CustomerMemo).toEqual({ value: 'Taux valable 2026.' });
    expect(payload.SalesTermRef).toEqual({ value: '3' });
    expect(payload.BillEmail).toEqual({ Address: 'appro@example.com' });
  });

  it('omits template fields when not provided and surfaces errors', async () => {
    mockQuickBooksInstance.createEstimate.mockImplementation((_p: any, cb: any) => cb(new Error('boom'), null));

    const result = await createQuickbooksEstimate({
      customer_ref: '77',
      line_items: [{ item_ref: '74', qty: 1, unit_price: 285 }],
    });

    expect(result.isError).toBe(true);
    const payload = mockQuickBooksInstance.createEstimate.mock.calls[0][0] as any;
    expect(payload.CustomerMemo).toBeUndefined();
    expect(payload.SalesTermRef).toBeUndefined();
    expect(payload.BillEmail).toBeUndefined();
  });

  it('increments LineNum/Id and maps service_date across multiple lines', async () => {
    mockQuickBooksInstance.createEstimate.mockImplementation((_p: any, cb: any) => cb(null, { Id: '904' }));

    await createQuickbooksEstimate({
      customer_ref: '77',
      line_items: [
        { item_ref: '74', qty: 1, unit_price: 285, service_date: '2026-06-16' },
        { item_ref: '74', qty: 2, unit_price: 285, service_date: '2026-06-18' },
      ],
    });

    const payload = mockQuickBooksInstance.createEstimate.mock.calls[0][0] as any;
    expect(payload.Line[0].SalesItemLineDetail.ServiceDate).toBe('2026-06-16');
    expect(payload.Line[1].LineNum).toBe(2);
    expect(payload.Line[1].Id).toBe('2');
    expect(payload.Line[1].Amount).toBe(570);
    expect(payload.Line[1].SalesItemLineDetail.ServiceDate).toBe('2026-06-18');
  });

  it('surfaces an auth/getInstance rejection via the outer catch', async () => {
    (mockQuickbooksClientClass.getInstance as any).mockRejectedValue(new Error('Auth failed'));

    const result = await createQuickbooksEstimate({
      customer_ref: '77',
      line_items: [{ item_ref: '74', qty: 1, unit_price: 285 }],
    });

    expect(result.isError).toBe(true);
    expect(result.error).toContain('Auth failed');
  });
});
