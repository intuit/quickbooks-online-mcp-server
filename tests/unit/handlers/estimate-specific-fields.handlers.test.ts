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
});
