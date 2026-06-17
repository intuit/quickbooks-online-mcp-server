import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { mockQuickbooksClient, mockQuickbooksClientClass, mockQuickBooksInstance, resetAllMocks } from '../../mocks/quickbooks.mock';

// ESM-compatible module mocking
jest.unstable_mockModule('../../../src/clients/quickbooks-client', () => ({
  quickbooksClient: mockQuickbooksClient,
  QuickbooksClient: mockQuickbooksClientClass,
}));

// Dynamic imports after mock setup
const { createQuickbooksCreditMemo } = await import('../../../src/handlers/create-quickbooks-credit-memo.handler');
const { getQuickbooksCreditMemo } = await import('../../../src/handlers/get-quickbooks-credit-memo.handler');
const { updateQuickbooksCreditMemo } = await import('../../../src/handlers/update-quickbooks-credit-memo.handler');
const { deleteQuickbooksCreditMemo } = await import('../../../src/handlers/delete-quickbooks-credit-memo.handler');
const { searchQuickbooksCreditMemos } = await import('../../../src/handlers/search-quickbooks-credit-memos.handler');

describe('CreditMemo Handlers', () => {
  beforeEach(() => {
    resetAllMocks();
  });

  describe('createQuickbooksCreditMemo', () => {
    it('should create a credit memo successfully', async () => {
      const mockMemo = { Id: '123', TotalAmt: 100 };
      mockQuickBooksInstance.createCreditMemo.mockImplementation((payload: any, cb: any) => cb(null, mockMemo));

      const result = await createQuickbooksCreditMemo({
        customer_ref: 'cust-1',
        line_items: [{ item_ref: 'item-1', qty: 1, unit_price: 100 }]
      });

      expect(result.isError).toBe(false);
      expect(result.result).toEqual(mockMemo);
      const payload = (mockQuickBooksInstance.createCreditMemo.mock.calls[0] as any)[0];
      expect(payload).not.toHaveProperty('GlobalTaxCalculation');
    });

    it('should pass per-line TaxCodeRef and GlobalTaxCalculation to QuickBooks', async () => {
      mockQuickBooksInstance.createCreditMemo.mockImplementation((payload: any, cb: any) => cb(null, { Id: '123' }));

      const result = await createQuickbooksCreditMemo({
        customer_ref: 'cust-1',
        line_items: [
          { item_ref: 'item-1', qty: 2, unit_price: 50, tax_code_ref: '14' },
          { item_ref: 'item-2', qty: 1, unit_price: 75 }
        ],
        global_tax_calculation: 'TaxExcluded'
      });

      expect(result.isError).toBe(false);
      const payload = (mockQuickBooksInstance.createCreditMemo.mock.calls[0] as any)[0];
      expect(payload.Line[0].SalesItemLineDetail.TaxCodeRef).toEqual({ value: '14' });
      expect(payload.Line[1].SalesItemLineDetail.TaxCodeRef).toBeUndefined();
      expect(payload.GlobalTaxCalculation).toBe('TaxExcluded');
    });

    it('should handle errors', async () => {
      mockQuickBooksInstance.createCreditMemo.mockImplementation((payload: any, cb: any) =>
        cb('Error occurred', null)
      );

      const result = await createQuickbooksCreditMemo({ customer_ref: 'cust-1', line_items: [] });

      expect(result.isError).toBe(true);
    });

    it('should handle authentication errors', async () => {
      (mockQuickbooksClientClass.getInstance as any).mockRejectedValue(new Error('Auth failed'));

      const result = await createQuickbooksCreditMemo({ customer_ref: 'cust-1', line_items: [] });

      expect(result.isError).toBe(true);
      expect(result.error).toContain('Auth failed');
    });

    it('should create with all optional fields', async () => {
      const mockMemo = { Id: '123', TotalAmt: 200 };
      mockQuickBooksInstance.createCreditMemo.mockImplementation((payload: any, cb: any) => cb(null, mockMemo));

      const result = await createQuickbooksCreditMemo({
        customer_ref: 'cust-1',
        line_items: [
          { item_ref: 'item-1', qty: 2, unit_price: 100, description: 'Test item' }
        ],
        txn_date: '2024-01-15',
        doc_number: 'CM-001',
        private_note: 'Test credit memo'
      });

      expect(result.isError).toBe(false);
      expect(result.result).toEqual(mockMemo);
    });
  });

  describe('getQuickbooksCreditMemo', () => {
    it('should get a credit memo by ID', async () => {
      const mockMemo = { Id: '123' };
      mockQuickBooksInstance.getCreditMemo.mockImplementation((_id: any, cb: any) => cb(null, mockMemo));

      const result = await getQuickbooksCreditMemo('123');

      expect(result.isError).toBe(false);
      expect(result.result).toEqual(mockMemo);
    });

    it('should handle API errors', async () => {
      mockQuickBooksInstance.getCreditMemo.mockImplementation((_id: any, cb: any) =>
        cb(new Error('Not found'), null)
      );

      const result = await getQuickbooksCreditMemo('999');

      expect(result.isError).toBe(true);
    });

    it('should handle authentication errors', async () => {
      (mockQuickbooksClientClass.getInstance as any).mockRejectedValue(new Error('Auth failed'));

      const result = await getQuickbooksCreditMemo('123');

      expect(result.isError).toBe(true);
      expect(result.error).toContain('Auth failed');
    });
  });

  describe('updateQuickbooksCreditMemo', () => {
    it('should update a credit memo', async () => {
      const mockUpdated = { Id: '123' };
      mockQuickBooksInstance.updateCreditMemo.mockImplementation((payload: any, cb: any) => cb(null, mockUpdated));

      const result = await updateQuickbooksCreditMemo({ id: '123', sync_token: '0' });

      expect(result.isError).toBe(false);
    });

    it('should handle API errors', async () => {
      mockQuickBooksInstance.updateCreditMemo.mockImplementation((payload: any, cb: any) =>
        cb(new Error('Update failed'), null)
      );

      const result = await updateQuickbooksCreditMemo({ id: '123', sync_token: '0' });

      expect(result.isError).toBe(true);
    });

    it('should handle authentication errors', async () => {
      (mockQuickbooksClientClass.getInstance as any).mockRejectedValue(new Error('Auth failed'));

      const result = await updateQuickbooksCreditMemo({ id: '123', sync_token: '0' });

      expect(result.isError).toBe(true);
      expect(result.error).toContain('Auth failed');
    });

    it('should update with all optional fields', async () => {
      const mockUpdated = { Id: '123', DocNumber: 'CM-002' };
      mockQuickBooksInstance.updateCreditMemo.mockImplementation((payload: any, cb: any) => cb(null, mockUpdated));

      const result = await updateQuickbooksCreditMemo({
        id: '123',
        sync_token: '0',
        customer_ref: 'cust-2',
        private_note: 'Updated note',
        doc_number: 'CM-002'
      });

      expect(result.isError).toBe(false);
      expect(result.result).toEqual(mockUpdated);
    });
  });

  describe('deleteQuickbooksCreditMemo', () => {
    it('should delete a credit memo', async () => {
      mockQuickBooksInstance.deleteCreditMemo.mockImplementation((payload: any, cb: any) => cb(null, {}));

      const result = await deleteQuickbooksCreditMemo({ id: '123', sync_token: '0' });

      expect(result.isError).toBe(false);
    });

    it('should handle API errors', async () => {
      mockQuickBooksInstance.deleteCreditMemo.mockImplementation((payload: any, cb: any) =>
        cb(new Error('Delete failed'), null)
      );

      const result = await deleteQuickbooksCreditMemo({ id: '123', sync_token: '0' });

      expect(result.isError).toBe(true);
    });

    it('should handle authentication errors', async () => {
      (mockQuickbooksClientClass.getInstance as any).mockRejectedValue(new Error('Auth failed'));

      const result = await deleteQuickbooksCreditMemo({ id: '123', sync_token: '0' });

      expect(result.isError).toBe(true);
      expect(result.error).toContain('Auth failed');
    });
  });

  describe('searchQuickbooksCreditMemos', () => {
    it('should search credit memos', async () => {
      const mockMemos = [{ Id: '1' }];
      mockQuickBooksInstance.findCreditMemos.mockImplementation((criteria: any, cb: any) =>
        cb(null, { QueryResponse: { CreditMemo: mockMemos } })
      );

      const result = await searchQuickbooksCreditMemos({});

      expect(result.isError).toBe(false);
      expect(result.result).toEqual(mockMemos);
    });

    it('should search with all filter options', async () => {
      mockQuickBooksInstance.findCreditMemos.mockImplementation((criteria: any, cb: any) =>
        cb(null, { QueryResponse: { CreditMemo: [] } })
      );

      const result = await searchQuickbooksCreditMemos({
        customer_ref: 'cust-1',
        txn_date_from: '2024-01-01',
        txn_date_to: '2024-12-31',
        limit: 50
      });

      expect(result.isError).toBe(false);
    });

    it('should handle API errors', async () => {
      mockQuickBooksInstance.findCreditMemos.mockImplementation((criteria: any, cb: any) =>
        cb(new Error('Search failed'), null)
      );

      const result = await searchQuickbooksCreditMemos({});

      expect(result.isError).toBe(true);
    });

    it('should handle authentication errors', async () => {
      (mockQuickbooksClientClass.getInstance as any).mockRejectedValue(new Error('Auth failed'));

      const result = await searchQuickbooksCreditMemos({});

      expect(result.isError).toBe(true);
      expect(result.error).toContain('Auth failed');
    });

    it('should handle empty QueryResponse', async () => {
      mockQuickBooksInstance.findCreditMemos.mockImplementation((criteria: any, cb: any) =>
        cb(null, { QueryResponse: {} })
      );

      const result = await searchQuickbooksCreditMemos({ limit: 5 });

      expect(result.isError).toBe(false);
      expect(result.result).toEqual([]);
    });
  });
});


