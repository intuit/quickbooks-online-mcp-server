import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { mockQuickbooksClient, mockQuickBooksInstance, resetAllMocks } from '../../mocks/quickbooks.mock';

// ESM-compatible module mocking
jest.unstable_mockModule('../../../src/clients/quickbooks-client', () => ({
  quickbooksClient: mockQuickbooksClient,
}));

// Dynamic imports after mock setup
const { createQuickbooksBill } = await import('../../../src/handlers/create-quickbooks-bill.handler');
const { getQuickbooksBill } = await import('../../../src/handlers/get-quickbooks-bill.handler');
const { updateQuickbooksBill } = await import('../../../src/handlers/update-quickbooks-bill.handler');
const { deleteQuickbooksBill } = await import('../../../src/handlers/delete-quickbooks-bill.handler');
const { searchQuickbooksBills } = await import('../../../src/handlers/search-quickbooks-bills.handler');

describe('Bill Handlers', () => {
  beforeEach(() => {
    resetAllMocks();
  });

  describe('createQuickbooksBill', () => {
    it('should create a bill successfully', async () => {
      const mockBill = { Id: '1', TotalAmt: 500, Balance: 500 };
      mockQuickBooksInstance.createBill.mockImplementation((_payload: any, cb: any) => cb(null, mockBill));

      const result = await createQuickbooksBill({
        Line: [{ Amount: 500, DetailType: 'AccountBasedExpenseLineDetail', Description: 'Office supplies', AccountRef: { value: '1' } }],
        VendorRef: { value: '56' },
        DueDate: '2026-05-01',
        Balance: 500,
        TotalAmt: 500,
      });

      expect(result.isError).toBe(false);
      expect(result.result).toEqual(mockBill);
    });

    it('should handle API errors', async () => {
      mockQuickBooksInstance.createBill.mockImplementation((_payload: any, cb: any) =>
        cb(new Error('SAXParseException: Premature end of file'), null)
      );

      const result = await createQuickbooksBill({});

      expect(result.isError).toBe(true);
    });

    it('should handle authentication errors', async () => {
      (mockQuickbooksClient.authenticate as any).mockRejectedValue(new Error('Auth failed'));

      const result = await createQuickbooksBill({});

      expect(result.isError).toBe(true);
      expect(result.error).toContain('Error: Auth failed');
    });
  });

  describe('getQuickbooksBill', () => {
    it('should get a bill by ID', async () => {
      const mockBill = { Id: '1', TotalAmt: 500, Balance: 500 };
      mockQuickBooksInstance.getBill.mockImplementation((_id: any, cb: any) => cb(null, mockBill));

      const result = await getQuickbooksBill('1');

      expect(result.isError).toBe(false);
      expect(result.result).toEqual(mockBill);
    });

    it('should handle API errors', async () => {
      mockQuickBooksInstance.getBill.mockImplementation((_id: any, cb: any) =>
        cb(new Error('Not found'), null)
      );

      const result = await getQuickbooksBill('999');

      expect(result.isError).toBe(true);
    });

    it('should handle authentication errors', async () => {
      (mockQuickbooksClient.authenticate as any).mockRejectedValue(new Error('Auth failed'));

      const result = await getQuickbooksBill('1');

      expect(result.isError).toBe(true);
      expect(result.error).toContain('Error: Auth failed');
    });
  });

  describe('updateQuickbooksBill', () => {
    it('should update a bill', async () => {
      const mockUpdated = { Id: '1', TotalAmt: 750, SyncToken: '1' };
      mockQuickBooksInstance.updateBill.mockImplementation((_payload: any, cb: any) => cb(null, mockUpdated));

      const result = await updateQuickbooksBill({ Id: '1', SyncToken: '0', TotalAmt: 750 });

      expect(result.isError).toBe(false);
      expect(result.result).toEqual(mockUpdated);
    });

    it('should handle API errors', async () => {
      mockQuickBooksInstance.updateBill.mockImplementation((_payload: any, cb: any) =>
        cb(new Error('Update failed'), null)
      );

      const result = await updateQuickbooksBill({ Id: '1', SyncToken: '0' });

      expect(result.isError).toBe(true);
    });

    it('should handle authentication errors', async () => {
      (mockQuickbooksClient.authenticate as any).mockRejectedValue(new Error('Auth failed'));

      const result = await updateQuickbooksBill({ Id: '1', SyncToken: '0' });

      expect(result.isError).toBe(true);
      expect(result.error).toContain('Error: Auth failed');
    });
  });

  describe('deleteQuickbooksBill', () => {
    it('should delete a bill', async () => {
      const mockDeleted = { Id: '1', status: 'Deleted' };
      mockQuickBooksInstance.deleteBill.mockImplementation((_payload: any, cb: any) => cb(null, mockDeleted));

      const result = await deleteQuickbooksBill({ Id: '1', SyncToken: '0' });

      expect(result.isError).toBe(false);
      expect(result.result).toEqual(mockDeleted);
    });

    it('should handle API errors', async () => {
      mockQuickBooksInstance.deleteBill.mockImplementation((_payload: any, cb: any) =>
        cb(new Error('Delete failed'), null)
      );

      const result = await deleteQuickbooksBill({ Id: '1', SyncToken: '0' });

      expect(result.isError).toBe(true);
    });

    it('should handle authentication errors', async () => {
      (mockQuickbooksClient.authenticate as any).mockRejectedValue(new Error('Auth failed'));

      const result = await deleteQuickbooksBill({ Id: '1', SyncToken: '0' });

      expect(result.isError).toBe(true);
      expect(result.error).toContain('Error: Auth failed');
    });
  });

  describe('searchQuickbooksBills', () => {
    it('should search bills', async () => {
      const mockBills = [{ Id: '1', TotalAmt: 500 }, { Id: '2', TotalAmt: 300 }];
      mockQuickBooksInstance.findBills.mockImplementation((_criteria: any, cb: any) =>
        cb(null, { QueryResponse: { Bill: mockBills } })
      );

      const result = await searchQuickbooksBills({});

      expect(result.isError).toBe(false);
      expect(result.result).toEqual(mockBills);
    });

    it('should search bills with array criteria', async () => {
      mockQuickBooksInstance.findBills.mockImplementation((_criteria: any, cb: any) =>
        cb(null, { QueryResponse: { Bill: [{ Id: '1', TotalAmt: 500 }] } })
      );

      const result = await searchQuickbooksBills([
        { field: 'TotalAmt', value: '500', operator: '>' },
      ]);

      expect(result.isError).toBe(false);
      expect(result.result).toHaveLength(1);
    });

    it('should use default empty criteria when none provided', async () => {
      mockQuickBooksInstance.findBills.mockImplementation((_criteria: any, cb: any) =>
        cb(null, { QueryResponse: { Bill: [] } })
      );

      const result = await searchQuickbooksBills();

      expect(result.isError).toBe(false);
      expect(result.result).toEqual([]);
    });

    it('should return totalCount for count queries', async () => {
      mockQuickBooksInstance.findBills.mockImplementation((_criteria: any, cb: any) =>
        cb(null, { QueryResponse: { totalCount: 42 } })
      );

      const result = await searchQuickbooksBills({});

      expect(result.isError).toBe(false);
      expect(result.result).toBe(42);
    });

    it('should handle empty QueryResponse', async () => {
      mockQuickBooksInstance.findBills.mockImplementation((_criteria: any, cb: any) =>
        cb(null, { QueryResponse: {} })
      );

      const result = await searchQuickbooksBills({});

      expect(result.isError).toBe(false);
      expect(result.result).toEqual([]);
    });

    it('should handle API errors', async () => {
      mockQuickBooksInstance.findBills.mockImplementation((_criteria: any, cb: any) =>
        cb(new Error('Search failed'), null)
      );

      const result = await searchQuickbooksBills({});

      expect(result.isError).toBe(true);
    });

    it('should handle authentication errors', async () => {
      (mockQuickbooksClient.authenticate as any).mockRejectedValue(new Error('Auth failed'));

      const result = await searchQuickbooksBills({});

      expect(result.isError).toBe(true);
      expect(result.error).toContain('Error: Auth failed');
    });
  });
});
