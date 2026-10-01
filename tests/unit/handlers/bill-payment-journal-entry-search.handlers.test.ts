import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { mockQuickbooksClient, mockQuickbooksClientClass, mockQuickBooksInstance, resetAllMocks } from '../../mocks/quickbooks.mock';

// ESM-compatible module mocking
jest.unstable_mockModule('../../../src/clients/quickbooks-client', () => ({
  quickbooksClient: mockQuickbooksClient,
  QuickbooksClient: mockQuickbooksClientClass,
}));

// Dynamic imports after mock setup
const { searchQuickbooksBillPayments } = await import('../../../src/handlers/search-quickbooks-bill-payments.handler');
const { searchQuickbooksJournalEntries } = await import('../../../src/handlers/search-quickbooks-journal-entries.handler');

const cases = [
  { name: 'search_bill_payments', fn: searchQuickbooksBillPayments, finder: 'findBillPayments', entity: 'BillPayment' },
  { name: 'search_journal_entries', fn: searchQuickbooksJournalEntries, finder: 'findJournalEntries', entity: 'JournalEntry' },
] as const;

describe.each(cases)('$name – Fixes #132', ({ fn, finder, entity }) => {
  beforeEach(() => {
    resetAllMocks();
  });

  it('should return the entity array, not the raw SDK envelope', async () => {
    const rows = [{ Id: '1' }, { Id: '2' }];
    (mockQuickBooksInstance[finder] as jest.Mock).mockImplementation(
      (_criteria: any, cb: any) => cb(null, { QueryResponse: { [entity]: rows, maxResults: 2 }, time: '2026-01-01' })
    );

    const result = await fn({});

    expect(result.isError).toBe(false);
    expect(result.result).toEqual(rows);
    expect(result.result).not.toHaveProperty('QueryResponse');
  });

  it('should return an empty array when nothing matches', async () => {
    (mockQuickBooksInstance[finder] as jest.Mock).mockImplementation(
      (_criteria: any, cb: any) => cb(null, { QueryResponse: {}, time: '2026-01-01' })
    );

    const result = await fn({});

    expect(result.isError).toBe(false);
    expect(result.result).toEqual([]);
  });

  it('should return totalCount for count queries', async () => {
    (mockQuickBooksInstance[finder] as jest.Mock).mockImplementation(
      (_criteria: any, cb: any) => cb(null, { QueryResponse: { totalCount: 7 }, time: '2026-01-01' })
    );

    const result = await fn({ count: true });

    expect(result.isError).toBe(false);
    expect(result.result).toBe(7);
  });

  it('should handle API errors', async () => {
    (mockQuickBooksInstance[finder] as jest.Mock).mockImplementation(
      (_criteria: any, cb: any) => cb(new Error('API Error'), null)
    );

    const result = await fn({});

    expect(result.isError).toBe(true);
  });

  it('should handle authentication errors', async () => {
    (mockQuickbooksClientClass.getInstance as any).mockRejectedValue(new Error('Auth failed'));

    const result = await fn({});

    expect(result.isError).toBe(true);
    expect(result.error).toContain('Auth failed');
  });
});
