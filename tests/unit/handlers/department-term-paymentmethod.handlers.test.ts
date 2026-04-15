import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { mockGetQuickbooks, mockQuickBooksInstance, resetAllMocks } from '../../mocks/quickbooks.mock';

// ESM-compatible module mocking
jest.unstable_mockModule('../../../src/clients/quickbooks-client', () => ({
  getQuickbooks: mockGetQuickbooks,
}));

// Dynamic imports after mock setup
const { createQuickbooksDepartment } = await import('../../../src/handlers/create-quickbooks-department.handler');
const { getQuickbooksDepartment } = await import('../../../src/handlers/get-quickbooks-department.handler');
const { updateQuickbooksDepartment } = await import('../../../src/handlers/update-quickbooks-department.handler');
const { searchQuickbooksDepartments } = await import('../../../src/handlers/search-quickbooks-departments.handler');
const { createQuickbooksTerm } = await import('../../../src/handlers/create-quickbooks-term.handler');
const { getQuickbooksTerm } = await import('../../../src/handlers/get-quickbooks-term.handler');
const { updateQuickbooksTerm } = await import('../../../src/handlers/update-quickbooks-term.handler');
const { searchQuickbooksTerms } = await import('../../../src/handlers/search-quickbooks-terms.handler');
const { createQuickbooksPaymentMethod } = await import('../../../src/handlers/create-quickbooks-payment-method.handler');
const { getQuickbooksPaymentMethod } = await import('../../../src/handlers/get-quickbooks-payment-method.handler');
const { updateQuickbooksPaymentMethod } = await import('../../../src/handlers/update-quickbooks-payment-method.handler');
const { searchQuickbooksPaymentMethods } = await import('../../../src/handlers/search-quickbooks-payment-methods.handler');

describe('Department, Term, PaymentMethod Handlers', () => {
  beforeEach(() => {
    resetAllMocks();
  });

  describe('Department Handlers', () => {
    describe('createQuickbooksDepartment', () => {
      it('should create a department', async () => {
        const mockDept = { Id: '1', Name: 'Sales' };
        mockQuickBooksInstance.createDepartment.mockImplementation((payload: any, cb: any) => cb(null, mockDept));

        const result = await createQuickbooksDepartment({ name: 'Sales' });

        expect(result.isError).toBe(false);
        expect(result.result).toEqual(mockDept);
      });

      it('should create with parent', async () => {
        mockQuickBooksInstance.createDepartment.mockImplementation((payload: any, cb: any) => cb(null, {}));

        const result = await createQuickbooksDepartment({ name: 'West Coast', parent_ref: '1' });

        expect(result.isError).toBe(false);
      });
    });

    describe('getQuickbooksDepartment', () => {
      it('should get a department', async () => {
        const mockDept = { Id: '1', Name: 'Sales' };
        mockQuickBooksInstance.getDepartment.mockImplementation((_id: any, cb: any) => cb(null, mockDept));

        const result = await getQuickbooksDepartment('1');

        expect(result.isError).toBe(false);
      });
    });

    describe('updateQuickbooksDepartment', () => {
      it('should update a department', async () => {
        mockQuickBooksInstance.updateDepartment.mockImplementation((payload: any, cb: any) => cb(null, {}));

        const result = await updateQuickbooksDepartment({ id: '1', sync_token: '0', name: 'Marketing', active: true });

        expect(result.isError).toBe(false);
      });
    });

    describe('searchQuickbooksDepartments', () => {
      it('should search departments', async () => {
        const mockDepts = [{ Id: '1' }];
        mockQuickBooksInstance.findDepartments.mockImplementation((criteria: any, cb: any) =>
          cb(null, { QueryResponse: { Department: mockDepts } })
        );

        const result = await searchQuickbooksDepartments({ name: 'Sales', active: true, limit: 10 });

        expect(result.isError).toBe(false);
        expect(result.result).toEqual(mockDepts);
      });

      it('should handle API errors', async () => {
        mockQuickBooksInstance.findDepartments.mockImplementation((criteria: any, cb: any) =>
          cb(new Error('Search failed'), null)
        );

        const result = await searchQuickbooksDepartments({});

        expect(result.isError).toBe(true);
      });

      it('should handle authentication errors', async () => {
        (mockGetQuickbooks as any).mockRejectedValue(new Error('Auth failed'));

        const result = await searchQuickbooksDepartments({});

        expect(result.isError).toBe(true);
        expect(result.error).toContain('Auth failed');
      });

      it('should handle empty QueryResponse', async () => {
        mockQuickBooksInstance.findDepartments.mockImplementation((criteria: any, cb: any) =>
          cb(null, { QueryResponse: {} })
        );

        const result = await searchQuickbooksDepartments({ limit: 5 });

        expect(result.isError).toBe(false);
        expect(result.result).toEqual([]);
      });
    });

    it('should create department - authentication error', async () => {
      (mockGetQuickbooks as any).mockRejectedValue(new Error('Auth failed'));

      const result = await createQuickbooksDepartment({ name: 'Test' });

      expect(result.isError).toBe(true);
      expect(result.error).toContain('Auth failed');
    });

    it('should create department - API error', async () => {
      mockQuickBooksInstance.createDepartment.mockImplementation((payload: any, cb: any) =>
        cb(new Error('Create failed'), null)
      );

      const result = await createQuickbooksDepartment({ name: 'Test' });

      expect(result.isError).toBe(true);
    });

    it('should get department - authentication error', async () => {
      (mockGetQuickbooks as any).mockRejectedValue(new Error('Auth failed'));

      const result = await getQuickbooksDepartment('1');

      expect(result.isError).toBe(true);
      expect(result.error).toContain('Auth failed');
    });

    it('should get department - API error', async () => {
      mockQuickBooksInstance.getDepartment.mockImplementation((_id: any, cb: any) =>
        cb(new Error('Not found'), null)
      );

      const result = await getQuickbooksDepartment('999');

      expect(result.isError).toBe(true);
    });

    it('should update department - authentication error', async () => {
      (mockGetQuickbooks as any).mockRejectedValue(new Error('Auth failed'));

      const result = await updateQuickbooksDepartment({ id: '1', sync_token: '0' });

      expect(result.isError).toBe(true);
      expect(result.error).toContain('Auth failed');
    });

    it('should update department - API error', async () => {
      mockQuickBooksInstance.updateDepartment.mockImplementation((payload: any, cb: any) =>
        cb(new Error('Update failed'), null)
      );

      const result = await updateQuickbooksDepartment({ id: '1', sync_token: '0' });

      expect(result.isError).toBe(true);
    });
  });

  describe('Term Handlers', () => {
    describe('createQuickbooksTerm', () => {
      it('should create a term', async () => {
        const mockTerm = { Id: '1', Name: 'Net 30', DueDays: 30 };
        mockQuickBooksInstance.createTerm.mockImplementation((payload: any, cb: any) => cb(null, mockTerm));

        const result = await createQuickbooksTerm({ name: 'Net 30', due_days: 30 });

        expect(result.isError).toBe(false);
      });

      it('should create a term with only name', async () => {
        const mockTerm = { Id: '2', Name: 'Due On Receipt' };
        mockQuickBooksInstance.createTerm.mockImplementation((payload: any, cb: any) => cb(null, mockTerm));

        const result = await createQuickbooksTerm({ name: 'Due On Receipt' });

        expect(result.isError).toBe(false);
      });

      it('should create with all options', async () => {
        mockQuickBooksInstance.createTerm.mockImplementation((payload: any, cb: any) => cb(null, {}));

        const result = await createQuickbooksTerm({
          name: '2/10 Net 30',
          due_days: 30,
          discount_days: 10,
          discount_percent: 2,
          type: 'STANDARD',
          day_of_month_due: 15,
          due_next_month_days: 25,
          discount_day_of_month: 10
        });

        expect(result.isError).toBe(false);
      });
    });

    describe('getQuickbooksTerm', () => {
      it('should get a term', async () => {
        const mockTerm = { Id: '1', Name: 'Net 30' };
        mockQuickBooksInstance.getTerm.mockImplementation((_id: any, cb: any) => cb(null, mockTerm));

        const result = await getQuickbooksTerm('1');

        expect(result.isError).toBe(false);
      });
    });

    describe('updateQuickbooksTerm', () => {
      it('should update a term', async () => {
        mockQuickBooksInstance.updateTerm.mockImplementation((payload: any, cb: any) => cb(null, {}));

        const result = await updateQuickbooksTerm({
          id: '1',
          sync_token: '0',
          name: 'Net 45',
          active: true,
          due_days: 45,
          discount_days: 15,
          discount_percent: 3
        });

        expect(result.isError).toBe(false);
      });
    });

    describe('searchQuickbooksTerms', () => {
      it('should search terms', async () => {
        const mockTerms = [{ Id: '1', Name: 'Net 30' }];
        mockQuickBooksInstance.findTerms.mockImplementation((criteria: any, cb: any) =>
          cb(null, { QueryResponse: { Term: mockTerms } })
        );

        const result = await searchQuickbooksTerms({ name: 'Net', active: true, limit: 10 });

        expect(result.isError).toBe(false);
        expect(result.result).toEqual(mockTerms);
      });

      it('should handle API errors', async () => {
        mockQuickBooksInstance.findTerms.mockImplementation((criteria: any, cb: any) =>
          cb(new Error('Search failed'), null)
        );

        const result = await searchQuickbooksTerms({});

        expect(result.isError).toBe(true);
      });

      it('should handle authentication errors', async () => {
        (mockGetQuickbooks as any).mockRejectedValue(new Error('Auth failed'));

        const result = await searchQuickbooksTerms({});

        expect(result.isError).toBe(true);
        expect(result.error).toContain('Auth failed');
      });

      it('should handle empty QueryResponse', async () => {
        mockQuickBooksInstance.findTerms.mockImplementation((criteria: any, cb: any) =>
          cb(null, { QueryResponse: {} })
        );

        const result = await searchQuickbooksTerms({ limit: 5 });

        expect(result.isError).toBe(false);
        expect(result.result).toEqual([]);
      });
    });

    it('should create term - authentication error', async () => {
      (mockGetQuickbooks as any).mockRejectedValue(new Error('Auth failed'));

      const result = await createQuickbooksTerm({ name: 'Test', due_days: 30 });

      expect(result.isError).toBe(true);
      expect(result.error).toContain('Auth failed');
    });

    it('should create term - API error', async () => {
      mockQuickBooksInstance.createTerm.mockImplementation((payload: any, cb: any) =>
        cb(new Error('Create failed'), null)
      );

      const result = await createQuickbooksTerm({ name: 'Test', due_days: 30 });

      expect(result.isError).toBe(true);
    });

    it('should get term - authentication error', async () => {
      (mockGetQuickbooks as any).mockRejectedValue(new Error('Auth failed'));

      const result = await getQuickbooksTerm('1');

      expect(result.isError).toBe(true);
      expect(result.error).toContain('Auth failed');
    });

    it('should get term - API error', async () => {
      mockQuickBooksInstance.getTerm.mockImplementation((_id: any, cb: any) =>
        cb(new Error('Not found'), null)
      );

      const result = await getQuickbooksTerm('999');

      expect(result.isError).toBe(true);
    });

    it('should update term - authentication error', async () => {
      (mockGetQuickbooks as any).mockRejectedValue(new Error('Auth failed'));

      const result = await updateQuickbooksTerm({ id: '1', sync_token: '0' });

      expect(result.isError).toBe(true);
      expect(result.error).toContain('Auth failed');
    });

    it('should update term - API error', async () => {
      mockQuickBooksInstance.updateTerm.mockImplementation((payload: any, cb: any) =>
        cb(new Error('Update failed'), null)
      );

      const result = await updateQuickbooksTerm({ id: '1', sync_token: '0' });

      expect(result.isError).toBe(true);
    });
  });

  describe('PaymentMethod Handlers', () => {
    describe('createQuickbooksPaymentMethod', () => {
      it('should create a payment method', async () => {
        const mockMethod = { Id: '1', Name: 'Credit Card' };
        mockQuickBooksInstance.createPaymentMethod.mockImplementation((payload: any, cb: any) => cb(null, mockMethod));

        const result = await createQuickbooksPaymentMethod({ name: 'Credit Card', type: 'CREDIT_CARD' });

        expect(result.isError).toBe(false);
      });

      it('should create a payment method without optional type', async () => {
        const mockMethod = { Id: '2', Name: 'Cash' };
        mockQuickBooksInstance.createPaymentMethod.mockImplementation((payload: any, cb: any) => cb(null, mockMethod));

        const result = await createQuickbooksPaymentMethod({ name: 'Cash' });

        expect(result.isError).toBe(false);
      });
    });

    describe('getQuickbooksPaymentMethod', () => {
      it('should get a payment method', async () => {
        mockQuickBooksInstance.getPaymentMethod.mockImplementation((_id: any, cb: any) => cb(null, {}));

        const result = await getQuickbooksPaymentMethod('1');

        expect(result.isError).toBe(false);
      });
    });

    describe('updateQuickbooksPaymentMethod', () => {
      it('should update a payment method', async () => {
        mockQuickBooksInstance.updatePaymentMethod.mockImplementation((payload: any, cb: any) => cb(null, {}));

        const result = await updateQuickbooksPaymentMethod({ id: '1', sync_token: '0', name: 'Visa', active: true });

        expect(result.isError).toBe(false);
      });
    });

    describe('searchQuickbooksPaymentMethods', () => {
      it('should search payment methods', async () => {
        const mockMethods = [{ Id: '1', Name: 'Cash' }];
        mockQuickBooksInstance.findPaymentMethods.mockImplementation((criteria: any, cb: any) =>
          cb(null, { QueryResponse: { PaymentMethod: mockMethods } })
        );

        const result = await searchQuickbooksPaymentMethods({ name: 'Cash', active: true, type: 'NON_CREDIT_CARD', limit: 10 });

        expect(result.isError).toBe(false);
        expect(result.result).toEqual(mockMethods);
      });

      it('should handle API errors', async () => {
        mockQuickBooksInstance.findPaymentMethods.mockImplementation((criteria: any, cb: any) =>
          cb(new Error('Search failed'), null)
        );

        const result = await searchQuickbooksPaymentMethods({});

        expect(result.isError).toBe(true);
      });

      it('should handle authentication errors', async () => {
        (mockGetQuickbooks as any).mockRejectedValue(new Error('Auth failed'));

        const result = await searchQuickbooksPaymentMethods({});

        expect(result.isError).toBe(true);
        expect(result.error).toContain('Auth failed');
      });

      it('should handle empty QueryResponse', async () => {
        mockQuickBooksInstance.findPaymentMethods.mockImplementation((criteria: any, cb: any) =>
          cb(null, { QueryResponse: {} })
        );

        const result = await searchQuickbooksPaymentMethods({ limit: 5 });

        expect(result.isError).toBe(false);
        expect(result.result).toEqual([]);
      });
    });

    it('should create payment method - authentication error', async () => {
      (mockGetQuickbooks as any).mockRejectedValue(new Error('Auth failed'));

      const result = await createQuickbooksPaymentMethod({ name: 'Test', type: 'NON_CREDIT_CARD' });

      expect(result.isError).toBe(true);
      expect(result.error).toContain('Auth failed');
    });

    it('should create payment method - API error', async () => {
      mockQuickBooksInstance.createPaymentMethod.mockImplementation((payload: any, cb: any) =>
        cb(new Error('Create failed'), null)
      );

      const result = await createQuickbooksPaymentMethod({ name: 'Test', type: 'NON_CREDIT_CARD' });

      expect(result.isError).toBe(true);
    });

    it('should get payment method - authentication error', async () => {
      (mockGetQuickbooks as any).mockRejectedValue(new Error('Auth failed'));

      const result = await getQuickbooksPaymentMethod('1');

      expect(result.isError).toBe(true);
      expect(result.error).toContain('Auth failed');
    });

    it('should get payment method - API error', async () => {
      mockQuickBooksInstance.getPaymentMethod.mockImplementation((_id: any, cb: any) =>
        cb(new Error('Not found'), null)
      );

      const result = await getQuickbooksPaymentMethod('999');

      expect(result.isError).toBe(true);
    });

    it('should update payment method - authentication error', async () => {
      (mockGetQuickbooks as any).mockRejectedValue(new Error('Auth failed'));

      const result = await updateQuickbooksPaymentMethod({ id: '1', sync_token: '0' });

      expect(result.isError).toBe(true);
      expect(result.error).toContain('Auth failed');
    });

    it('should update payment method - API error', async () => {
      mockQuickBooksInstance.updatePaymentMethod.mockImplementation((payload: any, cb: any) =>
        cb(new Error('Update failed'), null)
      );

      const result = await updateQuickbooksPaymentMethod({ id: '1', sync_token: '0' });

      expect(result.isError).toBe(true);
    });
  });
});
