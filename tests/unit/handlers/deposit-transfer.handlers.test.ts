import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { mockGetQuickbooks, mockQuickBooksInstance, resetAllMocks } from '../../mocks/quickbooks.mock';

// ESM-compatible module mocking
jest.unstable_mockModule('../../../src/clients/quickbooks-client', () => ({
  getQuickbooks: mockGetQuickbooks,
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
      (mockGetQuickbooks as any).mockRejectedValue(new Error('Auth failed'));

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
      (mockGetQuickbooks as any).mockRejectedValue(new Error('Auth failed'));

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
      mockQuickBooksInstance.updateDeposit.mockImplementation((payload: any, cb: any) => cb(null, {}));

      const result = await updateQuickbooksDeposit({ id: '1', sync_token: '0' });

      expect(result.isError).toBe(false);
    });

    it('should update a deposit with all optional fields', async () => {
      mockQuickBooksInstance.updateDeposit.mockImplementation((payload: any, cb: any) => cb(null, {}));

      const result = await updateQuickbooksDeposit({
        id: '1',
        sync_token: '0',
        private_note: 'Updated deposit note'
      });

      expect(result.isError).toBe(false);
    });

    it('should update a deposit - authentication error', async () => {
      (mockGetQuickbooks as any).mockRejectedValue(new Error('Auth failed'));

      const result = await updateQuickbooksDeposit({ id: '1', sync_token: '0' });

      expect(result.isError).toBe(true);
      expect(result.error).toContain('Auth failed');
    });

    it('should update a deposit - API error', async () => {
      mockQuickBooksInstance.updateDeposit.mockImplementation((payload: any, cb: any) =>
        cb(new Error('Update failed'), null)
      );

      const result = await updateQuickbooksDeposit({ id: '1', sync_token: '0' });

      expect(result.isError).toBe(true);
    });

    it('should delete a deposit', async () => {
      mockQuickBooksInstance.deleteDeposit.mockImplementation((payload: any, cb: any) => cb(null, {}));

      const result = await deleteQuickbooksDeposit({ id: '1', sync_token: '0' });

      expect(result.isError).toBe(false);
    });

    it('should delete a deposit - authentication error', async () => {
      (mockGetQuickbooks as any).mockRejectedValue(new Error('Auth failed'));

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
      (mockGetQuickbooks as any).mockRejectedValue(new Error('Auth failed'));

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
      (mockGetQuickbooks as any).mockRejectedValue(new Error('Auth failed'));

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
      (mockGetQuickbooks as any).mockRejectedValue(new Error('Auth failed'));

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
      (mockGetQuickbooks as any).mockRejectedValue(new Error('Auth failed'));

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
      (mockGetQuickbooks as any).mockRejectedValue(new Error('Auth failed'));

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

    it('should handle empty QueryResponse', async () => {
      mockQuickBooksInstance.findTransfers.mockImplementation((criteria: any, cb: any) =>
        cb(null, { QueryResponse: {} })
      );

      const result = await searchQuickbooksTransfers({ limit: 5 });

      expect(result.isError).toBe(false);
      expect(result.result).toEqual([]);
    });

    it('should handle authentication errors', async () => {
      (mockGetQuickbooks as any).mockRejectedValue(new Error('Token expired'));

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
