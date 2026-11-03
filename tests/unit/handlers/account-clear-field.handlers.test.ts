import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { mockQuickbooksClient, mockQuickbooksClientClass, mockQuickBooksInstance, resetAllMocks } from '../../mocks/quickbooks.mock';

jest.unstable_mockModule('../../../src/clients/quickbooks-client', () => ({
  quickbooksClient: mockQuickbooksClient,
  QuickbooksClient: mockQuickbooksClientClass,
}));

const { updateQuickbooksAccount } = await import('../../../src/handlers/update-quickbooks-account.handler');

describe('updateQuickbooksAccount clearing fields', () => {
  const existing = {
    Id: '60',
    Name: 'Rent',
    AccountType: 'Expense',
    AcctNum: '6100',
    Description: 'Office rent',
    SyncToken: '3',
  };

  beforeEach(() => {
    resetAllMocks();
  });

  it('removes a null patch field from the payload so QBO clears it', async () => {
    let captured: any;
    mockQuickBooksInstance.getAccount.mockImplementation((_id: any, cb: any) => cb(null, { ...existing }));
    mockQuickBooksInstance.updateAccount.mockImplementation((payload: any, cb: any) => {
      captured = payload;
      cb(null, payload);
    });

    const result = await updateQuickbooksAccount({ account_id: '60', patch: { AcctNum: null } });

    expect(result.isError).toBe(false);
    expect('AcctNum' in captured).toBe(false);
    // Everything else from the fetched account is still sent (full update)
    expect(captured.Name).toBe('Rent');
    expect(captured.Description).toBe('Office rent');
    expect(captured.SyncToken).toBe('3');
    // Without sparse:false node-quickbooks defaults to a sparse update, which ignores absent fields
    expect(captured.sparse).toBe(false);
  });

  it('still overlays non-null patch fields alongside a cleared one', async () => {
    let captured: any;
    mockQuickBooksInstance.getAccount.mockImplementation((_id: any, cb: any) => cb(null, { ...existing }));
    mockQuickBooksInstance.updateAccount.mockImplementation((payload: any, cb: any) => {
      captured = payload;
      cb(null, payload);
    });

    await updateQuickbooksAccount({
      account_id: '60',
      patch: { Description: null, Name: 'Office Rent', AcctNum: 6200 },
    });

    expect('Description' in captured).toBe(false);
    expect(captured.Name).toBe('Office Rent');
    expect(captured.AcctNum).toBe(6200);
    expect(captured.Id).toBe('60');
  });
});
