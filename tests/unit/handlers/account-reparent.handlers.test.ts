import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { mockQuickbooksClient, mockQuickbooksClientClass, mockQuickBooksInstance, resetAllMocks } from '../../mocks/quickbooks.mock';

jest.unstable_mockModule('../../../src/clients/quickbooks-client', () => ({
  quickbooksClient: mockQuickbooksClient,
  QuickbooksClient: mockQuickbooksClientClass,
}));

const { updateQuickbooksAccount } = await import('../../../src/handlers/update-quickbooks-account.handler');

describe('updateQuickbooksAccount re-parenting', () => {
  beforeEach(() => {
    resetAllMocks();
  });

  it('sends ParentRef as a reference object (not "[object Object]") and sends sparse:false', async () => {
    const existing = {
      Id: '50',
      Name: 'Child Account',
      AccountType: 'Income',
      AccountSubType: 'ServiceFeeIncome',
      Classification: 'Revenue',
      SubAccount: false,
      SyncToken: '0',
      sparse: false,
    };
    let captured: any;
    mockQuickBooksInstance.getAccount.mockImplementation((_id: any, cb: any) => cb(null, existing));
    mockQuickBooksInstance.updateAccount.mockImplementation((payload: any, cb: any) => {
      captured = payload;
      cb(null, { ...existing, SubAccount: true, ParentRef: { value: '40' }, SyncToken: '1' });
    });

    const result = await updateQuickbooksAccount({
      account_id: '50',
      patch: { SubAccount: true, ParentRef: { value: '40' } },
    });

    expect(result.isError).toBe(false);
    expect(captured.ParentRef).toEqual({ value: '40' });
    expect(typeof captured.ParentRef).toBe('object');
    expect(captured.SubAccount).toBe(true);
    expect(captured.sparse).toBe(false);
    // Full-object update carries existing Name/type through (required by QBO)
    expect(captured.Name).toBe('Child Account');
    expect(captured.AccountType).toBe('Income');
  });

  it('coerces a bare-string ParentRef into the { value } object shape', async () => {
    const existing = { Id: '50', Name: 'X', AccountType: 'Income', SyncToken: '0' };
    let captured: any;
    mockQuickBooksInstance.getAccount.mockImplementation((_id: any, cb: any) => cb(null, existing));
    mockQuickBooksInstance.updateAccount.mockImplementation((payload: any, cb: any) => {
      captured = payload;
      cb(null, existing);
    });

    await updateQuickbooksAccount({ account_id: '50', patch: { SubAccount: true, ParentRef: '40' } });

    expect(captured.ParentRef).toEqual({ value: '40' });
  });

  it('normalizes scalar field types and passes unknown keys through', async () => {
    const existing = { Id: '50', Name: 'X', SyncToken: '0' };
    let captured: any;
    mockQuickBooksInstance.getAccount.mockImplementation((_id: any, cb: any) => cb(null, existing));
    mockQuickBooksInstance.updateAccount.mockImplementation((payload: any, cb: any) => {
      captured = payload;
      cb(null, existing);
    });

    await updateQuickbooksAccount({
      account_id: '50',
      patch: {
        Name: 123,               // number -> string
        Active: 'true',          // string -> boolean true
        SubAccount: false,       // already boolean
        CurrentBalance: '42',    // string -> number
        Description: 7,          // already... number coerced via string arm
        AcctNum: '4000',         // unknown -> passthrough
        Skipped: undefined,      // undefined -> skipped
      },
    });

    expect(captured.Name).toBe('123');
    expect(captured.Active).toBe(true);
    expect(captured.SubAccount).toBe(false);
    expect(captured.CurrentBalance).toBe(42);
    expect(captured.AcctNum).toBe('4000');
    expect('Skipped' in captured).toBe(false);
  });

  it('coerces non-"true" string Active to false and already-number balance', async () => {
    const existing = { Id: '50', Name: 'X', SyncToken: '0' };
    let captured: any;
    mockQuickBooksInstance.getAccount.mockImplementation((_id: any, cb: any) => cb(null, existing));
    mockQuickBooksInstance.updateAccount.mockImplementation((payload: any, cb: any) => {
      captured = payload;
      cb(null, existing);
    });

    await updateQuickbooksAccount({ account_id: '50', patch: { Active: 'no', CurrentBalance: 100 } });

    expect(captured.Active).toBe(false);
    expect(captured.CurrentBalance).toBe(100);
  });

  it('returns isError when getAccount fails', async () => {
    mockQuickBooksInstance.getAccount.mockImplementation((_id: any, cb: any) => cb(new Error('not found'), null));
    const result = await updateQuickbooksAccount({ account_id: '999', patch: { Name: 'Y' } });
    expect(result.isError).toBe(true);
  });

  it('returns isError when updateAccount fails', async () => {
    const existing = { Id: '50', Name: 'X', SyncToken: '0' };
    mockQuickBooksInstance.getAccount.mockImplementation((_id: any, cb: any) => cb(null, existing));
    mockQuickBooksInstance.updateAccount.mockImplementation((_p: any, cb: any) => cb(new Error('stale'), null));
    const result = await updateQuickbooksAccount({ account_id: '50', patch: { Name: 'Y' } });
    expect(result.isError).toBe(true);
  });

  it('returns isError when the client cannot be obtained', async () => {
    mockQuickbooksClientClass.getInstance.mockRejectedValueOnce(new Error('no client') as never);
    const result = await updateQuickbooksAccount({ account_id: '50', patch: { Name: 'Y' } });
    expect(result.isError).toBe(true);
  });
});
