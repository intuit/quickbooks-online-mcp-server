import { jest, describe, it, expect, beforeEach, beforeAll } from '@jest/globals';
import { mockQuickbooksClient, mockQuickbooksClientClass, mockQuickBooksInstance, resetAllMocks } from '../../mocks/quickbooks.mock';

// ESM-compatible module mocking
jest.unstable_mockModule('../../../src/clients/quickbooks-client', () => ({
  quickbooksClient: mockQuickbooksClient,
  QuickbooksClient: mockQuickbooksClientClass,
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
      (mockQuickbooksClientClass.getInstance as any).mockRejectedValue(new Error('Auth failed'));

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

    it('should map reference number and multicurrency fields onto the QBO payload', async () => {
      // Capture the payload the handler builds so we can assert the new
      // PaymentRefNum / CurrencyRef / ExchangeRate fields are wired through —
      // these previously had no schema entry and were silently dropped.
      let capturedPayload: any = null;
      (mockQuickBooksInstance.createPayment as jest.Mock).mockImplementation(
        (payload: any, cb: any) => {
          capturedPayload = payload;
          cb(null, { Id: '123' });
        }
      );

      const result = await createQuickbooksPayment({
        customer_ref: 'cust-1',
        total_amt: 100,
        payment_ref_num: '755182592',
        currency_ref: 'GBP',
        exchange_rate: 1.17,
      });

      expect(result.isError).toBe(false);
      // PaymentRefNum is a plain string ("Reference no." in the QBO UI).
      expect(capturedPayload.PaymentRefNum).toBe('755182592');
      // CurrencyRef must be wrapped in { value } like the other *Ref fields.
      expect(capturedPayload.CurrencyRef).toEqual({ value: 'GBP' });
      expect(capturedPayload.ExchangeRate).toBe(1.17);
    });

    it('should omit reference number and multicurrency fields when not provided', async () => {
      // Backward compatibility: existing single-currency callers must not get
      // any of the new keys injected into their payload.
      let capturedPayload: any = null;
      (mockQuickBooksInstance.createPayment as jest.Mock).mockImplementation(
        (payload: any, cb: any) => {
          capturedPayload = payload;
          cb(null, { Id: '123' });
        }
      );

      await createQuickbooksPayment({ customer_ref: 'cust-1', total_amt: 100 });

      expect(capturedPayload).not.toHaveProperty('PaymentRefNum');
      expect(capturedPayload).not.toHaveProperty('CurrencyRef');
      expect(capturedPayload).not.toHaveProperty('ExchangeRate');
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
      (mockQuickbooksClientClass.getInstance as any).mockRejectedValue(new Error('Auth failed'));

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
      (mockQuickbooksClientClass.getInstance as any).mockRejectedValue(new Error('Auth failed'));

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
      (mockQuickbooksClientClass.getInstance as any).mockRejectedValue(new Error('Auth failed'));

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
      (mockQuickbooksClientClass.getInstance as any).mockRejectedValue(new Error('Auth failed'));

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


