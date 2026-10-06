import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { mockQuickBooksInstance, resetAllMocks, mockQuickbooksClient, mockQuickbooksClientClass } from '../../mocks/quickbooks.mock';

jest.unstable_mockModule('../../../src/clients/quickbooks-client', () => ({
  quickbooksClient: mockQuickbooksClient,
  QuickbooksClient: mockQuickbooksClientClass,
}));

const { createQuickbooksEstimate } = await import('../../../src/handlers/create-quickbooks-estimate.handler');

describe('Create Estimate Handler - estimate-specific fields', () => {
  beforeEach(() => resetAllMocks());

  it('maps expiration_date to ExpirationDate and txn_status to TxnStatus', async () => {
    mockQuickBooksInstance.createEstimate.mockImplementation((_p: any, cb: any) => cb(null, { Id: '910' }));

    await createQuickbooksEstimate({
      customer_ref: '77',
      line_items: [{ item_ref: '74', qty: 30, unit_price: 285 }],
      expiration_date: '2028-01-10',
      txn_status: 'Pending',
    });

    const payload = mockQuickBooksInstance.createEstimate.mock.calls[0][0] as any;
    expect(payload.ExpirationDate).toBe('2028-01-10');
    expect(payload.TxnStatus).toBe('Pending');
  });

  it('omits ExpirationDate and TxnStatus when not provided', async () => {
    mockQuickBooksInstance.createEstimate.mockImplementation((_p: any, cb: any) => cb(null, { Id: '911' }));

    await createQuickbooksEstimate({
      customer_ref: '77',
      line_items: [{ item_ref: '74', qty: 30, unit_price: 285 }],
    });

    const payload = mockQuickBooksInstance.createEstimate.mock.calls[0][0] as any;
    expect(payload.ExpirationDate).toBeUndefined();
    expect(payload.TxnStatus).toBeUndefined();
  });

  it('maps private_note to PrivateNote and keeps it out of CustomerMemo', async () => {
    mockQuickBooksInstance.createEstimate.mockImplementation((_p: any, cb: any) => cb(null, { Id: '912' }));

    await createQuickbooksEstimate({
      customer_ref: '77',
      line_items: [{ item_ref: '74', qty: 30, unit_price: 285 }],
      customer_memo: 'Valid for 18 months.',
      private_note: 'AI-generated draft - reviewed by JM',
    });

    const payload = mockQuickBooksInstance.createEstimate.mock.calls[0][0] as any;
    expect(payload.PrivateNote).toBe('AI-generated draft - reviewed by JM');
    expect(payload.CustomerMemo).toEqual({ value: 'Valid for 18 months.' });
  });

  it('omits PrivateNote when private_note is not provided', async () => {
    mockQuickBooksInstance.createEstimate.mockImplementation((_p: any, cb: any) => cb(null, { Id: '913' }));

    await createQuickbooksEstimate({
      customer_ref: '77',
      line_items: [{ item_ref: '74', qty: 30, unit_price: 285 }],
    });

    const payload = mockQuickBooksInstance.createEstimate.mock.calls[0][0] as any;
    expect(payload).not.toHaveProperty('PrivateNote');
  });

  it('declares private_note in the create_estimate schema', async () => {
    const { CreateEstimateTool } = await import('../../../src/tools/create-estimate.tool');
    const base = { customer_ref: '77', line_items: [{ item_ref: '74', qty: 1, unit_price: 1 }] };
    const parsed = CreateEstimateTool.schema.safeParse({ ...base, private_note: 'internal' });
    expect(parsed.success).toBe(true);
    expect((parsed as any).data.private_note).toBe('internal');
    expect(CreateEstimateTool.schema.safeParse({ ...base, private_note: '' }).success).toBe(false);
  });

  it('passes private_note through the create_estimate tool handler and reports errors', async () => {
    const { CreateEstimateTool } = await import('../../../src/tools/create-estimate.tool');
    const params = { customer_ref: '77', line_items: [{ item_ref: '74', qty: 1, unit_price: 1 }], private_note: 'internal' };

    mockQuickBooksInstance.createEstimate.mockImplementation((_p: any, cb: any) => cb(null, { Id: '914' }));
    const ok = await (CreateEstimateTool.handler as any)({ params });
    expect((mockQuickBooksInstance.createEstimate.mock.calls[0][0] as any).PrivateNote).toBe('internal');
    expect(JSON.parse(ok.content[1].text)).toEqual({ Id: '914' });

    mockQuickBooksInstance.createEstimate.mockImplementation((_p: any, cb: any) => cb(new Error('QBO fault'), null));
    const failed = await (CreateEstimateTool.handler as any)({ params });
    expect(failed.content[0].text).toContain('QBO fault');
  });
});
