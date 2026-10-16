import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { mockQuickbooksClient, mockQuickbooksClientClass, mockQuickBooksInstance, resetAllMocks } from '../../mocks/quickbooks.mock';

jest.unstable_mockModule('../../../src/clients/quickbooks-client', () => ({
  quickbooksClient: mockQuickbooksClient,
  QuickbooksClient: mockQuickbooksClientClass,
}));

const { UpdateDepositTool } = await import('../../../src/tools/update-deposit.tool');

describe('update_deposit handler', () => {
  beforeEach(() => resetAllMocks());

  const deposit = {
    Id: '7',
    SyncToken: '2',
    DepositToAccountRef: { value: '35' },
    Line: [{ Id: '0', Amount: 5, DetailType: 'DepositLineDetail', DepositLineDetail: { AccountRef: { value: '80' } } }],
  };

  it('returns the updated deposit as text content', async () => {
    mockQuickBooksInstance.getDeposit.mockImplementation((_id: any, cb: any) => cb(null, deposit));
    mockQuickBooksInstance.updateDeposit.mockImplementation((payload: any, cb: any) => cb(null, payload));

    const response: any = await UpdateDepositTool.handler({
      params: { id: '7', sync_token: '2', lines: [{ line_id: '0', account_ref: '99' }] },
    } as any, {} as any);

    expect(response.content[0].text).toBe('Deposit updated:');
    expect(JSON.parse(response.content[1].text).Line[0].DepositLineDetail.AccountRef).toEqual({ value: '99' });
  });

  it('returns the handler error as text content', async () => {
    const response: any = await UpdateDepositTool.handler({ params: { id: '7', sync_token: '2' } } as any, {} as any);

    expect(response.content[0].text).toContain('Error: Nothing to update');
  });
});

const base = { id: '7', sync_token: '2' };

describe('update_deposit schema', () => {
  it('accepts a lines entry with account_ref, description, or both', () => {
    for (const line of [
      { line_id: '0', account_ref: '99' },
      { line_id: '0', description: 'cashback' },
      { line_id: '0', account_ref: '99', description: 'cashback' },
    ]) {
      expect(UpdateDepositTool.schema.safeParse({ ...base, lines: [line] }).success).toBe(true);
    }
  });

  it('still accepts the original private_note-only input', () => {
    expect(UpdateDepositTool.schema.safeParse({ ...base, private_note: 'x' }).success).toBe(true);
  });

  it('rejects a lines entry with neither account_ref nor description', () => {
    expect(UpdateDepositTool.schema.safeParse({ ...base, lines: [{ line_id: '0' }] }).success).toBe(false);
  });

  it('rejects an empty line_id or account_ref', () => {
    expect(UpdateDepositTool.schema.safeParse({ ...base, lines: [{ line_id: '', account_ref: '9' }] }).success).toBe(false);
    expect(UpdateDepositTool.schema.safeParse({ ...base, lines: [{ line_id: '0', account_ref: '' }] }).success).toBe(false);
  });
});
