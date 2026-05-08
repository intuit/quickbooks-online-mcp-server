import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { mockQuickbooksClient, mockQuickBooksInstance, resetAllMocks } from '../../mocks/quickbooks.mock';

// ESM-compatible module mocking
jest.unstable_mockModule('../../../src/clients/quickbooks-client', () => ({
  quickbooksClient: mockQuickbooksClient,
}));

// Dynamic imports after mock setup
const { searchQuickbooksPurchases } = await import('../../../src/handlers/search-quickbooks-purchases.handler');
const { searchQuickbooksEmployees } = await import('../../../src/handlers/search-quickbooks-employees.handler');

describe('search_purchases – Fixes #14', () => {
  beforeEach(() => {
    resetAllMocks();
  });

  it('should return the entity array, not the raw SDK envelope', async () => {
    const mockPurchases = [{ Id: '1', TotalAmt: 50 }, { Id: '2', TotalAmt: 75 }];
    (mockQuickBooksInstance.findPurchases as jest.Mock).mockImplementation(
      (_criteria: any, cb: any) => cb(null, { QueryResponse: { Purchase: mockPurchases, maxResults: 2, startPosition: 1 }, time: '2026-01-01' })
    );

    const result = await searchQuickbooksPurchases({});

    expect(result.isError).toBe(false);
    // Must be the unwrapped array, not the full SDK response
    expect(result.result).toEqual(mockPurchases);
    expect(result.result).not.toHaveProperty('QueryResponse');
  });

  it('should return empty array when no purchases match', async () => {
    (mockQuickBooksInstance.findPurchases as jest.Mock).mockImplementation(
      (_criteria: any, cb: any) => cb(null, { QueryResponse: {}, time: '2026-01-01' })
    );

    const result = await searchQuickbooksPurchases({});

    expect(result.isError).toBe(false);
    expect(result.result).toEqual([]);
  });

  it('should handle API errors', async () => {
    (mockQuickBooksInstance.findPurchases as jest.Mock).mockImplementation(
      (_criteria: any, cb: any) => cb(new Error('API Error'), null)
    );

    const result = await searchQuickbooksPurchases({});

    expect(result.isError).toBe(true);
  });

  it('should handle authentication errors', async () => {
    (mockQuickbooksClient.authenticate as any).mockRejectedValue(new Error('Auth failed'));

    const result = await searchQuickbooksPurchases({});

    expect(result.isError).toBe(true);
    expect(result.error).toContain('Auth failed');
  });
});

describe('search_employees – Fixes #15', () => {
  beforeEach(() => {
    resetAllMocks();
  });

  it('should return the entity array, not the raw SDK envelope', async () => {
    const mockEmployees = [{ Id: '1', DisplayName: 'Alice' }, { Id: '2', DisplayName: 'Bob' }];
    (mockQuickBooksInstance.findEmployees as jest.Mock).mockImplementation(
      (_criteria: any, cb: any) => cb(null, { QueryResponse: { Employee: mockEmployees, maxResults: 2, startPosition: 1 }, time: '2026-01-01' })
    );

    const result = await searchQuickbooksEmployees({});

    expect(result.isError).toBe(false);
    // Must be the unwrapped array, not the full SDK response
    expect(result.result).toEqual(mockEmployees);
    expect(result.result).not.toHaveProperty('QueryResponse');
  });

  it('should return empty array when no employees match', async () => {
    (mockQuickBooksInstance.findEmployees as jest.Mock).mockImplementation(
      (_criteria: any, cb: any) => cb(null, { QueryResponse: {}, time: '2026-01-01' })
    );

    const result = await searchQuickbooksEmployees({});

    expect(result.isError).toBe(false);
    expect(result.result).toEqual([]);
  });

  it('should handle API errors', async () => {
    (mockQuickBooksInstance.findEmployees as jest.Mock).mockImplementation(
      (_criteria: any, cb: any) => cb(new Error('API Error'), null)
    );

    const result = await searchQuickbooksEmployees({});

    expect(result.isError).toBe(true);
  });

  it('should handle authentication errors', async () => {
    (mockQuickbooksClient.authenticate as any).mockRejectedValue(new Error('Auth failed'));

    const result = await searchQuickbooksEmployees({});

    expect(result.isError).toBe(true);
    expect(result.error).toContain('Auth failed');
  });
});
