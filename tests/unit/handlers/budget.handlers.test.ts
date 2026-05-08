import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { mockQuickbooksClient, mockQuickBooksInstance, resetAllMocks } from '../../mocks/quickbooks.mock';

jest.unstable_mockModule('../../../src/clients/quickbooks-client', () => ({
  quickbooksClient: mockQuickbooksClient,
}));

const { searchQuickbooksBudgets } = await import('../../../src/handlers/search-quickbooks-budgets.handler');

describe('Budget Handlers', () => {
  beforeEach(() => {
    resetAllMocks();
  });

  describe('searchQuickbooksBudgets', () => {
    it('should return budgets from QueryResponse.Budget', async () => {
      const mockBudgets = [
        {
          Id: '1',
          Name: 'FY2026 Operating',
          BudgetType: 'ProfitAndLoss',
          StartDate: '2025-07-01',
          EndDate: '2026-06-30',
          Active: true,
          BudgetDetail: [
            { AccountRef: { value: '80', name: '40000 Revenue' }, Amount: 100000, BudgetDate: '2025-07-01' },
          ],
        },
      ];
      mockQuickBooksInstance.findBudgets.mockImplementation((_criteria: any, cb: any) =>
        cb(null, { QueryResponse: { Budget: mockBudgets } })
      );

      const result = await searchQuickbooksBudgets({});

      expect(result.isError).toBe(false);
      expect(result.result).toEqual(mockBudgets);
    });

    it('should pass supported filters through to findBudgets', async () => {
      mockQuickBooksInstance.findBudgets.mockImplementation((criteria: any, cb: any) => {
        expect(criteria).toEqual({ Name: 'FY2026 Operating', Active: true, limit: 10 });
        cb(null, { QueryResponse: { Budget: [] } });
      });

      const result = await searchQuickbooksBudgets({ name: 'FY2026 Operating', active: true, limit: 10 });

      expect(result.isError).toBe(false);
    });

    it('should return an empty array when QueryResponse has no Budget key', async () => {
      mockQuickBooksInstance.findBudgets.mockImplementation((_criteria: any, cb: any) =>
        cb(null, { QueryResponse: {} })
      );

      const result = await searchQuickbooksBudgets({});

      expect(result.isError).toBe(false);
      expect(result.result).toEqual([]);
    });

    it('should propagate API errors', async () => {
      mockQuickBooksInstance.findBudgets.mockImplementation((_criteria: any, cb: any) =>
        cb(new Error('Query failed'), null)
      );

      const result = await searchQuickbooksBudgets({});

      expect(result.isError).toBe(true);
    });

    it('should propagate authentication errors', async () => {
      (mockQuickbooksClient.authenticate as any).mockRejectedValue(new Error('Auth failed'));

      const result = await searchQuickbooksBudgets({});

      expect(result.isError).toBe(true);
      expect(result.error).toContain('Auth failed');
    });
  });
});
