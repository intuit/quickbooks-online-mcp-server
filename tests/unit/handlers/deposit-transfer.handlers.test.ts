import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { mockQuickbooksClient, mockQuickbooksClientClass, mockQuickBooksInstance, resetAllMocks } from '../../mocks/quickbooks.mock';

// ESM-compatible module mocking
jest.unstable_mockModule('../../../src/clients/quickbooks-client', () => ({
  quickbooksClient: mockQuickbooksClient,
  QuickbooksClient: mockQuickbooksClientClass,
}));

// Dynamic imports after mock setup
const { createQuickbooksDeposit } = await import('../../../src/handlers/create-quickbooks-deposit.handler');
const { getQuickbooksDeposit } = await import('../../../src/handlers/get-quickbooks-deposit.handler');
const { updateQuickbooksDeposit } = await import('../../../src/handlers/update-quickbooks-deposit.handler');
const { deleteQuickbooksDeposit } = await import('../../../src/handlers/delete-quickbooks-deposit.handler');
const { searchQuickbooksDeposits } = await import('../../../src/handlers/search-quickbooks-deposits.handler');
const { createQuickbooksTransfer } = await import('../../../src/handlers/create-quickbooks-transfer.handler');
const { getQuickbooksTransfer } = await import('../../../src/handlers/get-quickbooks-transfer.handler');
const { updateQuickbooksTransfer } = await import('../../../src/handlers/update-quickbooks-transfer.handler');
const { deleteQuickbooksTransfer } = await import('../../../src/handlers/delete-quickbooks-transfer.handler');
const { searchQuickbooksTransfers } = await import('../../../src/handlers/search-quickbooks-transfers.handler');

describe('Deposit and Transfer Handlers', () => {
  beforeEach(() => {
    resetAllMocks();
  });

  describe('Deposit Handlers', () => {
    it('should create a deposit', async () => {
      const mockDeposit = { Id: '1', TotalAmt: 1000 };
      mockQuickBooksInstance.createDeposit.mockImplementation((payload: any, cb: any) => cb(null, mockDeposit));

      const result = await createQuickbooksDeposit({
        deposit_to_account_ref: 'account-1',
        line_items: [{ amount: 1000 }]
      });

      expect(result.isError).toBe(false);
      expect(result.result).toEqual(mockDeposit);
    });

    it('should create a deposit with all optional fields', async () => {
      const mockDeposit = { Id: '1', TotalAmt: 2000 };
      mockQuickBooksInstance.createDeposit.mockImplementation((payload: any, cb: any) => cb(null, mockDeposit));

      const result = await createQuickbooksDeposit({
        deposit_to_account_ref: 'account-1',
        line_items: [
          {
            amount: 1000,
            account_ref: 'income-account-1',
            description: 'Customer payment'
          },
          {
            amount: 1000,
            entity_ref: { type: 'Customer', value: 'cust-1' },
            description: 'Another payment'
          }
        ],
        txn_date: '2024-01-15',
        private_note: 'Batch deposit'
      });

      expect(result.isError).toBe(false);
      expect(result.result).toEqual(mockDeposit);
    });

    it('should create a deposit - API error', async () => {
      mockQuickBooksInstance.createDeposit.mockImplementation((payload: any, cb: any) =>
        cb(new Error('Create failed'), null)
      );

      const result = await createQuickbooksDeposit({
        deposit_to_account_ref: 'account-1',
        line_items: [{ amount: 1000 }]
      });

      expect(result.isError).toBe(true);
    });

    it('should create a deposit - authentication error', async () => {
      (mockQuickbooksClientClass.getInstance as any).mockRejectedValue(new Error('Auth failed'));

      const result = await createQuickbooksDeposit({
        deposit_to_account_ref: 'account-1',
        line_items: [{ amount: 1000 }]
      });

      expect(result.isError).toBe(true);
      expect(result.error).toContain('Auth failed');
    });

    it('should get a deposit', async () => {
      mockQuickBooksInstance.getDeposit.mockImplementation((_id: any, cb: any) => cb(null, { Id: '1' }));

      const result = await getQuickbooksDeposit('1');

      expect(result.isError).toBe(false);
    });

    it('should get a deposit - authentication error', async () => {
      (mockQuickbooksClientClass.getInstance as any).mockRejectedValue(new Error('Auth failed'));

      const result = await getQuickbooksDeposit('1');

      expect(result.isError).toBe(true);
      expect(result.error).toContain('Auth failed');
    });

    it('should get a deposit - API error', async () => {
      mockQuickBooksInstance.getDeposit.mockImplementation((_id: any, cb: any) =>
        cb(new Error('Not found'), null)
      );

      const result = await getQuickbooksDeposit('999');

      expect(result.isError).toBe(true);
    });

    it('should update a deposit', async () => {
      mockQuickBooksInstance.getDeposit.mockImplementation((_id: any, cb: any) =>
        cb(null, { Id: '1', SyncToken: '0', DepositToAccountRef: { value: '35' }, Line: [] })
      );
      mockQuickBooksInstance.updateDeposit.mockImplementation((payload: any, cb: any) => cb(null, {}));

      const result = await updateQuickbooksDeposit({ id: '1', sync_token: '0', private_note: 'note' });

      expect(result.isError).toBe(false);
    });

    it('should update a deposit with all optional fields', async () => {
      mockQuickBooksInstance.getDeposit.mockImplementation((_id: any, cb: any) =>
        cb(null, { Id: '1', SyncToken: '0', DepositToAccountRef: { value: '35' }, Line: [] })
      );
      mockQuickBooksInstance.updateDeposit.mockImplementation((payload: any, cb: any) => cb(null, {}));

      const result = await updateQuickbooksDeposit({
        id: '1',
        sync_token: '0',
        private_note: 'Updated deposit note'
      });

      expect(result.isError).toBe(false);
    });

    it('should fetch the current deposit and send a full (non-sparse) object, preserving fields the caller did not touch', async () => {
      // Regression guard: the old handler sent { Id, SyncToken, sparse: true }
      // and nothing else, which QBO rejects with "DepositToAccountRef missing"
      // on every single call, since Deposit doesn't honor sparse=true the way
      // Purchase does. The fix fetches the current record and merges onto it.
      mockQuickBooksInstance.getDeposit.mockImplementation((id: any, cb: any) => {
        expect(id).toBe('42');
        cb(null, {
          Id: '42',
          SyncToken: '3',
          DepositToAccountRef: { value: '35', name: 'Checking' },
          Line: [{ Id: '1', Amount: 100, DetailType: 'DepositLineDetail', DepositLineDetail: {} }],
        });
      });

      let captured: any;
      mockQuickBooksInstance.updateDeposit.mockImplementation((payload: any, cb: any) => {
        captured = payload;
        cb(null, payload);
      });

      const result = await updateQuickbooksDeposit({ id: '42', sync_token: '4', private_note: 'note' });

      expect(result.isError).toBe(false);
      // Untouched fields carried over from the fetched record.
      expect(captured.DepositToAccountRef).toEqual({ value: '35', name: 'Checking' });
      expect(captured.Line).toEqual([{ Id: '1', Amount: 100, DetailType: 'DepositLineDetail', DepositLineDetail: {} }]);
      // The caller-supplied sync_token wins over the one on the fetched record.
      expect(captured.SyncToken).toBe('4');
      expect(captured.PrivateNote).toBe('note');
      // No sparse flag — QBO does not honor sparse=true for Deposit.
      expect(captured.sparse).toBeUndefined();
    });

    describe('line re-categorization', () => {
      const makeDeposit = () => ({
        Id: '7',
        SyncToken: '2',
        TxnDate: '2026-09-30',
        PrivateNote: 'original note',
        TotalAmt: 150.25,
        DepositToAccountRef: { value: '35', name: 'Checking' },
        Line: [
          {
            Id: '0',
            LineNum: 1,
            Amount: 100,
            Description: 'cashback A',
            DetailType: 'DepositLineDetail',
            DepositLineDetail: { AccountRef: { value: '80', name: 'Uncategorized Income' }, Entity: { value: 'c1', type: 'Customer' } },
          },
          {
            Id: '1',
            LineNum: 2,
            Amount: 50.25,
            Description: 'interest',
            DetailType: 'DepositLineDetail',
            DepositLineDetail: { AccountRef: { value: '90', name: 'Interest Earned' } },
          },
        ],
      });

      let captured: any;
      beforeEach(() => {
        captured = undefined;
        mockQuickBooksInstance.getDeposit.mockImplementation((_id: any, cb: any) => cb(null, makeDeposit()));
        mockQuickBooksInstance.updateDeposit.mockImplementation((payload: any, cb: any) => {
          captured = payload;
          cb(null, payload);
        });
      });

      it('should change only the targeted line account and drop its stale name', async () => {
        const result = await updateQuickbooksDeposit({
          id: '7',
          sync_token: '2',
          lines: [{ line_id: '0', account_ref: '99' }],
        });

        expect(result.isError).toBe(false);
        const expected = makeDeposit();
        (expected.Line[0].DepositLineDetail as any).AccountRef = { value: '99' };
        expect(captured).toEqual(expected);
        // The untouched line is identical, amounts included.
        expect(captured.Line[1]).toEqual(makeDeposit().Line[1]);
        expect(captured.Line.map((l: any) => l.Amount)).toEqual([100, 50.25]);
        expect(captured.DepositToAccountRef).toEqual({ value: '35', name: 'Checking' });
        expect(captured.TxnDate).toBe('2026-09-30');
      });

      it('should change only the description when account_ref is omitted', async () => {
        const result = await updateQuickbooksDeposit({
          id: '7',
          sync_token: '2',
          lines: [{ line_id: '1', description: 'bank interest' }],
        });

        expect(result.isError).toBe(false);
        const expected = makeDeposit();
        expected.Line[1].Description = 'bank interest';
        expect(captured).toEqual(expected);
      });

      it('should change account and description together and handle several lines', async () => {
        const result = await updateQuickbooksDeposit({
          id: '7',
          sync_token: '2',
          lines: [
            { line_id: '0', account_ref: '99', description: 'cashback' },
            { line_id: '1', account_ref: '99' },
          ],
        });

        expect(result.isError).toBe(false);
        expect(captured.Line[0].DepositLineDetail.AccountRef).toEqual({ value: '99' });
        expect(captured.Line[0].DepositLineDetail.Entity).toEqual({ value: 'c1', type: 'Customer' });
        expect(captured.Line[0].Description).toBe('cashback');
        expect(captured.Line[1].DepositLineDetail.AccountRef).toEqual({ value: '99' });
        expect(captured.Line[1].Description).toBe('interest');
      });

      it('should apply lines and private_note together', async () => {
        await updateQuickbooksDeposit({
          id: '7',
          sync_token: '2',
          private_note: 'recategorized',
          lines: [{ line_id: '0', account_ref: '99' }],
        });

        expect(captured.PrivateNote).toBe('recategorized');
        expect(captured.Line[0].DepositLineDetail.AccountRef).toEqual({ value: '99' });
      });

      it('should keep the existing private_note when only lines are given', async () => {
        await updateQuickbooksDeposit({ id: '7', sync_token: '2', lines: [{ line_id: '0', account_ref: '99' }] });

        expect(captured.PrivateNote).toBe('original note');
      });

      it('should return an error on an unknown line_id without calling updateDeposit', async () => {
        const result = await updateQuickbooksDeposit({
          id: '7',
          sync_token: '2',
          lines: [{ line_id: 'nope', account_ref: '99' }],
        });

        expect(result.isError).toBe(true);
        expect(result.error).toContain('nope');
        expect(mockQuickBooksInstance.updateDeposit).not.toHaveBeenCalled();
      });

      it('should return an error on duplicate line_ids without calling updateDeposit', async () => {
        const result = await updateQuickbooksDeposit({
          id: '7',
          sync_token: '2',
          lines: [
            { line_id: '0', account_ref: '99' },
            { line_id: '0', description: 'again' },
          ],
        });

        expect(result.isError).toBe(true);
        expect(result.error).toContain('Duplicate');
        expect(mockQuickBooksInstance.updateDeposit).not.toHaveBeenCalled();
      });

      it('should return an error on an entry with neither account_ref nor description', async () => {
        const result = await updateQuickbooksDeposit({
          id: '7',
          sync_token: '2',
          lines: [{ line_id: '0' }],
        });

        expect(result.isError).toBe(true);
        expect(result.error).toContain('account_ref or description');
        expect(mockQuickBooksInstance.updateDeposit).not.toHaveBeenCalled();
      });

      it('should return an error on a line edit when the deposit has no lines at all', async () => {
        const deposit: any = makeDeposit();
        delete deposit.Line;
        mockQuickBooksInstance.getDeposit.mockImplementation((_id: any, cb: any) => cb(null, deposit));

        const result = await updateQuickbooksDeposit({ id: '7', sync_token: '2', lines: [{ line_id: '0', account_ref: '99' }] });

        expect(result.isError).toBe(true);
        expect(mockQuickBooksInstance.updateDeposit).not.toHaveBeenCalled();
      });

      it('should return an error when account_ref targets a line that is not a DepositLineDetail line', async () => {
        const deposit = makeDeposit();
        (deposit.Line[1] as any).DetailType = 'SubTotalLineDetail';
        delete (deposit.Line[1] as any).DepositLineDetail;
        mockQuickBooksInstance.getDeposit.mockImplementation((_id: any, cb: any) => cb(null, deposit));

        const result = await updateQuickbooksDeposit({
          id: '7',
          sync_token: '2',
          lines: [{ line_id: '1', account_ref: '99' }],
        });

        expect(result.isError).toBe(true);
        expect(result.error).toContain('DepositLineDetail');
        expect(mockQuickBooksInstance.updateDeposit).not.toHaveBeenCalled();
      });

      it('should return an error when account_ref targets a line linked to another transaction', async () => {
        const deposit = makeDeposit();
        const linked = deposit.Line.find((l: any) => l.Id === '1') as any;
        linked.LinkedTxn = [{ TxnId: '24', TxnType: 'Payment' }];
        mockQuickBooksInstance.getDeposit.mockImplementation((_id: any, cb: any) => cb(null, deposit));

        const result = await updateQuickbooksDeposit({
          id: '7',
          sync_token: '2',
          lines: [{ line_id: '1', account_ref: '99' }],
        });

        expect(result.isError).toBe(true);
        expect(result.error).toContain('linked');
        expect(mockQuickBooksInstance.updateDeposit).not.toHaveBeenCalled();
      });

      it('should return an error when there is nothing to update', async () => {
        for (const input of [
          { id: '7', sync_token: '2' },
          { id: '7', sync_token: '2', private_note: '' },
          { id: '7', sync_token: '2', lines: [] },
        ]) {
          const result = await updateQuickbooksDeposit(input);
          expect(result.isError).toBe(true);
          expect(result.error).toContain('Nothing to update');
        }
        expect(mockQuickBooksInstance.updateDeposit).not.toHaveBeenCalled();
      });
    });

    it('should update a deposit - authentication error', async () => {
      (mockQuickbooksClientClass.getInstance as any).mockRejectedValue(new Error('Auth failed'));

      const result = await updateQuickbooksDeposit({ id: '1', sync_token: '0', private_note: 'note' });

      expect(result.isError).toBe(true);
      expect(result.error).toContain('Auth failed');
    });

    it('should update a deposit - error fetching the current deposit', async () => {
      mockQuickBooksInstance.getDeposit.mockImplementation((_id: any, cb: any) =>
        cb(new Error('Not found'), null)
      );

      const result = await updateQuickbooksDeposit({ id: '999', sync_token: '0', private_note: 'note' });

      expect(result.isError).toBe(true);
      expect(result.error).toContain('Not found');
    });

    it('should update a deposit - API error', async () => {
      mockQuickBooksInstance.getDeposit.mockImplementation((_id: any, cb: any) =>
        cb(null, { Id: '1', SyncToken: '0', DepositToAccountRef: { value: '35' }, Line: [] })
      );
      mockQuickBooksInstance.updateDeposit.mockImplementation((payload: any, cb: any) =>
        cb(new Error('Update failed'), null)
      );

      const result = await updateQuickbooksDeposit({ id: '1', sync_token: '0', private_note: 'note' });

      expect(result.isError).toBe(true);
    });

    it('should delete a deposit', async () => {
      mockQuickBooksInstance.deleteDeposit.mockImplementation((payload: any, cb: any) => cb(null, {}));

      const result = await deleteQuickbooksDeposit({ id: '1', sync_token: '0' });

      expect(result.isError).toBe(false);
    });

    it('should delete a deposit - authentication error', async () => {
      (mockQuickbooksClientClass.getInstance as any).mockRejectedValue(new Error('Auth failed'));

      const result = await deleteQuickbooksDeposit({ id: '1', sync_token: '0' });

      expect(result.isError).toBe(true);
      expect(result.error).toContain('Auth failed');
    });

    it('should delete a deposit - API error', async () => {
      mockQuickBooksInstance.deleteDeposit.mockImplementation((payload: any, cb: any) =>
        cb(new Error('Delete failed'), null)
      );

      const result = await deleteQuickbooksDeposit({ id: '1', sync_token: '0' });

      expect(result.isError).toBe(true);
    });

    it('should search deposits', async () => {
      mockQuickBooksInstance.findDeposits.mockImplementation((criteria: any, cb: any) =>
        cb(null, { QueryResponse: { Deposit: [{ Id: '1' }] } })
      );

      const result = await searchQuickbooksDeposits({ limit: 10 });

      expect(result.isError).toBe(false);
    });

    it('should handle search errors', async () => {
      mockQuickBooksInstance.findDeposits.mockImplementation((criteria: any, cb: any) =>
        cb(new Error('API Error'), null)
      );

      const result = await searchQuickbooksDeposits({});

      expect(result.isError).toBe(true);
    });

    it('should search deposits - authentication error', async () => {
      (mockQuickbooksClientClass.getInstance as any).mockRejectedValue(new Error('Auth failed'));

      const result = await searchQuickbooksDeposits({});

      expect(result.isError).toBe(true);
      expect(result.error).toContain('Auth failed');
    });

    it('should search deposits with all filter options', async () => {
      mockQuickBooksInstance.findDeposits.mockImplementation((criteria: any, cb: any) =>
        cb(null, { QueryResponse: { Deposit: [] } })
      );

      const result = await searchQuickbooksDeposits({
        txn_date_from: '2024-01-01',
        txn_date_to: '2024-12-31',
        limit: 50
      });

      expect(result.isError).toBe(false);
    });

    it('should pass date filters in the array/operator format node-quickbooks parses', async () => {
      // Regression guard for the silently-ignored date filter bug: node-quickbooks
      // builds its WHERE clause from an array of { field, value, operator } objects
      // (module.criteriaToString -> `field operator value`). The old MongoDB-style
      // { TxnDate: { $gte } } had no `field`/`operator` keys and was dropped, so
      // date ranges were ignored. Assert the exact criteria shape reaching the lib.
      let captured: any;
      mockQuickBooksInstance.findDeposits.mockImplementation((criteria: any, cb: any) => {
        captured = criteria;
        cb(null, { QueryResponse: { Deposit: [] } });
      });

      await searchQuickbooksDeposits({ txn_date_from: '2024-01-01', txn_date_to: '2024-12-31', limit: 50 });

      expect(Array.isArray(captured)).toBe(true);
      expect(captured).toEqual(expect.arrayContaining([
        { field: 'TxnDate', value: '2024-01-01', operator: '>=' },
        { field: 'TxnDate', value: '2024-12-31', operator: '<=' },
        { field: 'limit', value: 50 },
      ]));
      // No MongoDB-style operators should survive.
      expect(JSON.stringify(captured)).not.toMatch(/\$gte|\$lte/);
    });

    it('should handle empty QueryResponse', async () => {
      mockQuickBooksInstance.findDeposits.mockImplementation((criteria: any, cb: any) =>
        cb(null, { QueryResponse: {} })
      );

      const result = await searchQuickbooksDeposits({ limit: 5 });

      expect(result.isError).toBe(false);
      expect(result.result).toEqual([]);
    });
  });

  describe('Transfer Handlers', () => {
    it('should create a transfer', async () => {
      const mockTransfer = { Id: '1', Amount: 500 };
      mockQuickBooksInstance.createTransfer.mockImplementation((payload: any, cb: any) => cb(null, mockTransfer));

      const result = await createQuickbooksTransfer({
        from_account_ref: 'account-1',
        to_account_ref: 'account-2',
        amount: 500
      });

      expect(result.isError).toBe(false);
      expect(result.result).toEqual(mockTransfer);
    });

    it('should create transfer with all options', async () => {
      mockQuickBooksInstance.createTransfer.mockImplementation((payload: any, cb: any) => cb(null, {}));

      const result = await createQuickbooksTransfer({
        from_account_ref: 'account-1',
        to_account_ref: 'account-2',
        amount: 500,
        txn_date: '2024-01-15',
        private_note: 'Monthly transfer'
      });

      expect(result.isError).toBe(false);
    });

    it('should get a transfer', async () => {
      mockQuickBooksInstance.getTransfer.mockImplementation((_id: any, cb: any) => cb(null, { Id: '1' }));

      const result = await getQuickbooksTransfer('1');

      expect(result.isError).toBe(false);
    });

    it('should get a transfer - authentication error', async () => {
      (mockQuickbooksClientClass.getInstance as any).mockRejectedValue(new Error('Auth failed'));

      const result = await getQuickbooksTransfer('1');

      expect(result.isError).toBe(true);
      expect(result.error).toContain('Auth failed');
    });

    it('should get a transfer - API error', async () => {
      mockQuickBooksInstance.getTransfer.mockImplementation((_id: any, cb: any) =>
        cb(new Error('Not found'), null)
      );

      const result = await getQuickbooksTransfer('999');

      expect(result.isError).toBe(true);
    });

    it('should update a transfer', async () => {
      mockQuickBooksInstance.updateTransfer.mockImplementation((payload: any, cb: any) => cb(null, {}));

      const result = await updateQuickbooksTransfer({
        id: '1',
        sync_token: '0',
        amount: 600,
        private_note: 'Updated'
      });

      expect(result.isError).toBe(false);
    });

    it('should update a transfer with account refs', async () => {
      mockQuickBooksInstance.updateTransfer.mockImplementation((payload: any, cb: any) => cb(null, {}));

      const result = await updateQuickbooksTransfer({
        id: '1',
        sync_token: '0',
        from_account_ref: 'new-from-account',
        to_account_ref: 'new-to-account'
      });

      expect(result.isError).toBe(false);
    });

    it('should update a transfer - authentication error', async () => {
      (mockQuickbooksClientClass.getInstance as any).mockRejectedValue(new Error('Auth failed'));

      const result = await updateQuickbooksTransfer({ id: '1', sync_token: '0' });

      expect(result.isError).toBe(true);
      expect(result.error).toContain('Auth failed');
    });

    it('should update a transfer - API error', async () => {
      mockQuickBooksInstance.updateTransfer.mockImplementation((payload: any, cb: any) =>
        cb(new Error('Update failed'), null)
      );

      const result = await updateQuickbooksTransfer({ id: '1', sync_token: '0' });

      expect(result.isError).toBe(true);
    });

    it('should delete a transfer', async () => {
      mockQuickBooksInstance.deleteTransfer.mockImplementation((payload: any, cb: any) => cb(null, {}));

      const result = await deleteQuickbooksTransfer({ id: '1', sync_token: '0' });

      expect(result.isError).toBe(false);
    });

    it('should delete a transfer - authentication error', async () => {
      (mockQuickbooksClientClass.getInstance as any).mockRejectedValue(new Error('Auth failed'));

      const result = await deleteQuickbooksTransfer({ id: '1', sync_token: '0' });

      expect(result.isError).toBe(true);
      expect(result.error).toContain('Auth failed');
    });

    it('should delete a transfer - API error', async () => {
      mockQuickBooksInstance.deleteTransfer.mockImplementation((payload: any, cb: any) =>
        cb(new Error('Delete failed'), null)
      );

      const result = await deleteQuickbooksTransfer({ id: '1', sync_token: '0' });

      expect(result.isError).toBe(true);
    });

    it('should search transfers', async () => {
      mockQuickBooksInstance.findTransfers.mockImplementation((criteria: any, cb: any) =>
        cb(null, { QueryResponse: { Transfer: [{ Id: '1' }] } })
      );

      const result = await searchQuickbooksTransfers({ limit: 10 });

      expect(result.isError).toBe(false);
    });

    it('should search transfers - authentication error', async () => {
      (mockQuickbooksClientClass.getInstance as any).mockRejectedValue(new Error('Auth failed'));

      const result = await searchQuickbooksTransfers({});

      expect(result.isError).toBe(true);
      expect(result.error).toContain('Auth failed');
    });

    it('should search transfers - API error', async () => {
      mockQuickBooksInstance.findTransfers.mockImplementation((criteria: any, cb: any) =>
        cb(new Error('Search failed'), null)
      );

      const result = await searchQuickbooksTransfers({});

      expect(result.isError).toBe(true);
    });

    it('should search transfers with all filter options', async () => {
      mockQuickBooksInstance.findTransfers.mockImplementation((criteria: any, cb: any) =>
        cb(null, { QueryResponse: { Transfer: [] } })
      );

      const result = await searchQuickbooksTransfers({
        txn_date_from: '2024-01-01',
        txn_date_to: '2024-12-31',
        limit: 50
      });

      expect(result.isError).toBe(false);
    });

    it('should pass date filters in the array/operator format node-quickbooks parses', async () => {
      let captured: any;
      mockQuickBooksInstance.findTransfers.mockImplementation((criteria: any, cb: any) => {
        captured = criteria;
        cb(null, { QueryResponse: { Transfer: [] } });
      });

      await searchQuickbooksTransfers({ txn_date_from: '2024-01-01', txn_date_to: '2024-12-31', limit: 50 });

      expect(Array.isArray(captured)).toBe(true);
      expect(captured).toEqual(expect.arrayContaining([
        { field: 'TxnDate', value: '2024-01-01', operator: '>=' },
        { field: 'TxnDate', value: '2024-12-31', operator: '<=' },
        { field: 'limit', value: 50 },
      ]));
      expect(JSON.stringify(captured)).not.toMatch(/\$gte|\$lte/);
    });

    it('should handle empty QueryResponse', async () => {
      mockQuickBooksInstance.findTransfers.mockImplementation((criteria: any, cb: any) =>
        cb(null, { QueryResponse: {} })
      );

      const result = await searchQuickbooksTransfers({ limit: 5 });

      expect(result.isError).toBe(false);
      expect(result.result).toEqual([]);
    });

    it('should handle authentication errors', async () => {
      (mockQuickbooksClientClass.getInstance as any).mockRejectedValue(new Error('Token expired'));

      const result = await createQuickbooksTransfer({
        from_account_ref: 'account-1',
        to_account_ref: 'account-2',
        amount: 500
      });

      expect(result.isError).toBe(true);
      expect(result.error).toContain('Token expired');
    });

    it('should create transfer - API error', async () => {
      mockQuickBooksInstance.createTransfer.mockImplementation((payload: any, cb: any) =>
        cb(new Error('Create failed'), null)
      );

      const result = await createQuickbooksTransfer({
        from_account_ref: 'account-1',
        to_account_ref: 'account-2',
        amount: 500
      });

      expect(result.isError).toBe(true);
    });
  });
});


