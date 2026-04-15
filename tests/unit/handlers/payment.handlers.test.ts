import { jest, describe, it, expect, beforeEach, beforeAll } from '@jest/globals';
import { mockGetQuickbooks, mockQuickBooksInstance, resetAllMocks } from '../../mocks/quickbooks.mock';

// ESM-compatible module mocking
jest.unstable_mockModule('../../../src/clients/quickbooks-client', () => ({
  getQuickbooks: mockGetQuickbooks,
}));

// Dynamic imports after mock setup
const { createQuickbooksPayment } = await import('../../../src/handlers/create-quickbooks-payment.handler');
const { getQuickbooksPayment } = await import('../../../src/handlers/get-quickbooks-payment.handler');
const { updateQuickbooksPayment } = await import('../../../src/handlers/update-quickbooks-payment.handler');
const { deleteQuickbooksPayment } = await import('../../../src/handlers/delete-quickbooks-payment.handler');
const { searchQuickbooksPayments } = await import('../../../src/handlers/search-quickbooks-payments.handler');

describe('Payment Handlers', () => {
  beforeEach(() => {
    resetAllMocks();
  });

  describe('createQuickbooksPayment', () => {
    it('should create a payment successfully', async () => {
      const mockPayment = { Id: '123', TotalAmt: 100 };
      (mockQuickBooksInstance.createPayment as jest.Mock).mockImplementation(
        (_payload: any, cb: any) => cb(null, mockPayment)
      );

      const result = await createQuickbooksPayment({ customer_ref: 'cust-1', total_amt: 100 });

      expect(result.isError).toBe(false);
      expect(result.result).toEqual(mockPayment);
    });

    it('should handle API errors', async () => {
      (mockQuickBooksInstance.createPayment as jest.Mock).mockImplementation(
        (_payload: any, cb: any) => cb(new Error('API Error'), null)
      );

      const result = await createQuickbooksPayment({ customer_ref: 'cust-1', total_amt: 100 });

      expect(result.isError).toBe(true);
    });

    it('should handle authentication errors', async () => {
      (mockGetQuickbooks as any).mockRejectedValue(new Error('Auth failed'));

      const result = await createQuickbooksPayment({ customer_ref: 'cust-1', total_amt: 100 });

      expect(result.isError).toBe(true);
      expect(result.error).toContain('Auth failed');
    });

    it('should create a payment with all optional fields', async () => {
      const mockPayment = { Id: '123', TotalAmt: 100 };
      (mockQuickBooksInstance.createPayment as jest.Mock).mockImplementation(
        (_payload: any, cb: any) => cb(null, mockPayment)
      );

      const result = await createQuickbooksPayment({
        customer_ref: 'cust-1',
        total_amt: 100,
        payment_method_ref: 'pm-1',
        deposit_to_account_ref: 'acc-1',
        txn_date: '2024-01-01',
        private_note: 'Test note',
        line: [{ amount: 100, linked_txn: [{ txn_id: 'inv-1', txn_type: 'Invoice' }] }]
      });

      expect(result.isError).toBe(false);
      expect(result.result).toEqual(mockPayment);
    });
  });

  describe('getQuickbooksPayment', () => {
    it('should get a payment by ID', async () => {
      const mockPayment = { Id: '123', TotalAmt: 100 };
      (mockQuickBooksInstance.getPayment as jest.Mock).mockImplementation(
        (_id: any, cb: any) => cb(null, mockPayment)
      );

      const result = await getQuickbooksPayment('123');

      expect(result.isError).toBe(false);
      expect(result.result).toEqual(mockPayment);
    });

    it('should handle not found errors', async () => {
      (mockQuickBooksInstance.getPayment as jest.Mock).mockImplementation(
        (_id: any, cb: any) => cb(new Error('Not found'), null)
      );

      const result = await getQuickbooksPayment('999');

      expect(result.isError).toBe(true);
    });

    it('should handle authentication errors', async () => {
      (mockGetQuickbooks as any).mockRejectedValue(new Error('Auth failed'));

      const result = await getQuickbooksPayment('123');

      expect(result.isError).toBe(true);
      expect(result.error).toContain('Auth failed');
    });
  });

  describe('updateQuickbooksPayment', () => {
    it('should update a payment', async () => {
      const mockUpdated = { Id: '123', TotalAmt: 150 };
      (mockQuickBooksInstance.updatePayment as jest.Mock).mockImplementation(
        (_payload: any, cb: any) => cb(null, mockUpdated)
      );

      const result = await updateQuickbooksPayment({ id: '123', sync_token: '0', total_amt: 150 });

      expect(result.isError).toBe(false);
      expect(result.result).toEqual(mockUpdated);
    });

    it('should update with all optional fields', async () => {
      const mockUpdated = { Id: '123' };
      (mockQuickBooksInstance.updatePayment as jest.Mock).mockImplementation(
        (_payload: any, cb: any) => cb(null, mockUpdated)
      );

      const result = await updateQuickbooksPayment({
        id: '123',
        sync_token: '0',
        customer_ref: 'cust-1',
        total_amt: 200,
        payment_method_ref: 'pm-1',
        private_note: 'Updated payment note'
      });

      expect(result.isError).toBe(false);
    });

    it('should update without total_amt', async () => {
      const mockUpdated = { Id: '123' };
      (mockQuickBooksInstance.updatePayment as jest.Mock).mockImplementation(
        (_payload: any, cb: any) => cb(null, mockUpdated)
      );

      const result = await updateQuickbooksPayment({
        id: '123',
        sync_token: '0',
        customer_ref: 'cust-2'
      });

      expect(result.isError).toBe(false);
    });

    it('should handle API errors', async () => {
      (mockQuickBooksInstance.updatePayment as jest.Mock).mockImplementation(
        (_payload: any, cb: any) => cb(new Error('Update failed'), null)
      );

      const result = await updateQuickbooksPayment({ id: '123', sync_token: '0', total_amt: 150 });

      expect(result.isError).toBe(true);
    });

    it('should handle authentication errors', async () => {
      (mockGetQuickbooks as any).mockRejectedValue(new Error('Auth failed'));

      const result = await updateQuickbooksPayment({ id: '123', sync_token: '0', total_amt: 150 });

      expect(result.isError).toBe(true);
      expect(result.error).toContain('Auth failed');
    });
  });

  describe('deleteQuickbooksPayment', () => {
    it('should void a payment', async () => {
      const mockVoided = { Id: '123', status: 'Voided' };
      (mockQuickBooksInstance.deletePayment as jest.Mock).mockImplementation(
        (_payload: any, cb: any) => cb(null, mockVoided)
      );

      const result = await deleteQuickbooksPayment({ id: '123', sync_token: '0' });

      expect(result.isError).toBe(false);
    });

    it('should handle API errors', async () => {
      (mockQuickBooksInstance.deletePayment as jest.Mock).mockImplementation(
        (_payload: any, cb: any) => cb(new Error('Delete failed'), null)
      );

      const result = await deleteQuickbooksPayment({ id: '123', sync_token: '0' });

      expect(result.isError).toBe(true);
    });

    it('should handle authentication errors', async () => {
      (mockGetQuickbooks as any).mockRejectedValue(new Error('Auth failed'));

      const result = await deleteQuickbooksPayment({ id: '123', sync_token: '0' });

      expect(result.isError).toBe(true);
      expect(result.error).toContain('Auth failed');
    });
  });

  describe('searchQuickbooksPayments', () => {
    it('should search payments with criteria', async () => {
      const mockPayments = [{ Id: '1' }, { Id: '2' }];
      (mockQuickBooksInstance.findPayments as jest.Mock).mockImplementation(
        (_criteria: any, cb: any) => cb(null, { QueryResponse: { Payment: mockPayments } })
      );

      const result = await searchQuickbooksPayments({ limit: 10 });

      expect(result.isError).toBe(false);
      expect(result.result).toEqual(mockPayments);
    });

    it('should return empty array when no results', async () => {
      (mockQuickBooksInstance.findPayments as jest.Mock).mockImplementation(
        (_criteria: any, cb: any) => cb(null, { QueryResponse: {} })
      );

      const result = await searchQuickbooksPayments({});

      expect(result.isError).toBe(false);
      expect(result.result).toEqual([]);
    });

    it('should handle API errors', async () => {
      (mockQuickBooksInstance.findPayments as jest.Mock).mockImplementation(
        (_criteria: any, cb: any) => cb(new Error('Search failed'), null)
      );

      const result = await searchQuickbooksPayments({});

      expect(result.isError).toBe(true);
    });

    it('should handle authentication errors', async () => {
      (mockGetQuickbooks as any).mockRejectedValue(new Error('Auth failed'));

      const result = await searchQuickbooksPayments({ limit: 10 });

      expect(result.isError).toBe(true);
      expect(result.error).toContain('Auth failed');
    });

    it('should search with all filter options', async () => {
      (mockQuickBooksInstance.findPayments as jest.Mock).mockImplementation(
        (_criteria: any, cb: any) => cb(null, { QueryResponse: { Payment: [] } })
      );

      const result = await searchQuickbooksPayments({
        customer_ref: 'cust-1',
        txn_date_from: '2024-01-01',
        txn_date_to: '2024-12-31',
        limit: 50
      });

      expect(result.isError).toBe(false);
    });
  });
});
