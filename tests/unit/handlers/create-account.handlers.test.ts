import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { mockQuickbooksClient, mockQuickbooksClientClass, mockQuickBooksInstance, resetAllMocks } from '../../mocks/quickbooks.mock';

jest.unstable_mockModule('../../../src/clients/quickbooks-client', () => ({
  quickbooksClient: mockQuickbooksClient,
  QuickbooksClient: mockQuickbooksClientClass,
}));

const { createQuickbooksAccount } = await import('../../../src/handlers/create-quickbooks-account.handler');

describe('createQuickbooksAccount', () => {
  beforeEach(() => {
    resetAllMocks();
  });

  it('creates a top-level account without SubAccount/ParentRef', async () => {
    let captured: any;
    const created = { Id: '10', Name: 'Office Supplies', SubAccount: false };
    mockQuickBooksInstance.createAccount.mockImplementation((payload: any, cb: any) => {
      captured = payload;
      cb(null, created);
    });

    const result = await createQuickbooksAccount({ name: 'Office Supplies', type: 'Expense' });

    expect(result.isError).toBe(false);
    expect(captured.SubAccount).toBeUndefined();
    expect(captured.ParentRef).toBeUndefined();
  });

  it('creates a sub-account when parent_id is supplied (SubAccount:true + ParentRef object)', async () => {
    let captured: any;
    const created = {
      Id: '11',
      Name: 'Software Subscriptions',
      SubAccount: true,
      ParentRef: { value: '5' },
      FullyQualifiedName: 'Operating Expenses:Software Subscriptions',
    };
    mockQuickBooksInstance.createAccount.mockImplementation((payload: any, cb: any) => {
      captured = payload;
      cb(null, created);
    });

    const result = await createQuickbooksAccount({
      name: 'Software Subscriptions',
      type: 'Expense',
      sub_type: 'OtherMiscellaneousServiceCost',
      parent_id: '5',
    });

    expect(result.isError).toBe(false);
    // The nested ParentRef must be a reference OBJECT, never the string "[object Object]"
    expect(captured.SubAccount).toBe(true);
    expect(captured.ParentRef).toEqual({ value: '5' });
    expect(typeof captured.ParentRef).toBe('object');
  });

  it('sends AcctNum when acct_num is supplied', async () => {
    let captured: any;
    mockQuickBooksInstance.createAccount.mockImplementation((payload: any, cb: any) => {
      captured = payload;
      cb(null, { Id: '12', Name: 'Rent', AcctNum: '6100' });
    });

    const result = await createQuickbooksAccount({ name: 'Rent', type: 'Expense', acct_num: '6100' });

    expect(result.isError).toBe(false);
    expect(captured.AcctNum).toBe('6100');
  });

  it('omits AcctNum when acct_num is not supplied', async () => {
    let captured: any;
    mockQuickBooksInstance.createAccount.mockImplementation((payload: any, cb: any) => {
      captured = payload;
      cb(null, { Id: '13', Name: 'Rent' });
    });

    await createQuickbooksAccount({ name: 'Rent', type: 'Expense' });

    expect('AcctNum' in captured).toBe(false);
  });

  it('propagates QBO errors', async () => {
    mockQuickBooksInstance.createAccount.mockImplementation((_payload: any, cb: any) =>
      cb(new Error('Duplicate name'), null)
    );

    const result = await createQuickbooksAccount({ name: 'Dup', type: 'Expense' });

    expect(result.isError).toBe(true);
  });

  it('returns isError when the client cannot be obtained', async () => {
    mockQuickbooksClientClass.getInstance.mockRejectedValueOnce(new Error('no client') as never);

    const result = await createQuickbooksAccount({ name: 'X', type: 'Expense' });

    expect(result.isError).toBe(true);
  });
});
