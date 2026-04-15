import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { mockGetQuickbooks, mockQuickBooksInstance, resetAllMocks } from '../../mocks/quickbooks.mock';

// ESM-compatible module mocking
jest.unstable_mockModule('../../../src/clients/quickbooks-client', () => ({
  getQuickbooks: mockGetQuickbooks,
}));

// Dynamic imports after mock setup
const { createQuickbooksClass } = await import('../../../src/handlers/create-quickbooks-class.handler');
const { getQuickbooksClass } = await import('../../../src/handlers/get-quickbooks-class.handler');
const { updateQuickbooksClass } = await import('../../../src/handlers/update-quickbooks-class.handler');
const { searchQuickbooksClasses } = await import('../../../src/handlers/search-quickbooks-classes.handler');

describe('Class Handlers', () => {
  beforeEach(() => {
    resetAllMocks();
  });

  describe('createQuickbooksClass', () => {
    it('should create a class successfully', async () => {
      const mockClass = { Id: '123', Name: 'Marketing' };
      mockQuickBooksInstance.createClass.mockImplementation((payload: any, cb: any) => cb(null, mockClass));

      const result = await createQuickbooksClass({ name: 'Marketing' });

      expect(result.isError).toBe(false);
      expect(result.result).toEqual(mockClass);
    });

    it('should create a sub-class with parent', async () => {
      const mockClass = { Id: '124', Name: 'Digital', ParentRef: { value: '123' } };
      mockQuickBooksInstance.createClass.mockImplementation((payload: any, cb: any) => cb(null, mockClass));

      const result = await createQuickbooksClass({ name: 'Digital', parent_ref: '123' });

      expect(result.isError).toBe(false);
    });

    it('should handle errors', async () => {
      mockQuickBooksInstance.createClass.mockImplementation((payload: any, cb: any) =>
        cb(new Error('Duplicate name'), null)
      );

      const result = await createQuickbooksClass({ name: 'Marketing' });

      expect(result.isError).toBe(true);
    });
  });

  describe('getQuickbooksClass', () => {
    it('should get a class by ID', async () => {
      const mockClass = { Id: '123', Name: 'Marketing' };
      mockQuickBooksInstance.getClass.mockImplementation((_id: any, cb: any) => cb(null, mockClass));

      const result = await getQuickbooksClass('123');

      expect(result.isError).toBe(false);
      expect(result.result).toEqual(mockClass);
    });

    it('should handle API errors', async () => {
      mockQuickBooksInstance.getClass.mockImplementation((_id: any, cb: any) =>
        cb(new Error('Not found'), null)
      );

      const result = await getQuickbooksClass('999');

      expect(result.isError).toBe(true);
    });

    it('should handle authentication errors', async () => {
      (mockGetQuickbooks as any).mockRejectedValue(new Error('Auth failed'));

      const result = await getQuickbooksClass('123');

      expect(result.isError).toBe(true);
      expect(result.error).toContain('Auth failed');
    });
  });

  describe('updateQuickbooksClass', () => {
    it('should update a class', async () => {
      const mockUpdated = { Id: '123', Name: 'Marketing Updated' };
      mockQuickBooksInstance.updateClass.mockImplementation((payload: any, cb: any) => cb(null, mockUpdated));

      const result = await updateQuickbooksClass({ id: '123', sync_token: '0', name: 'Marketing Updated' });

      expect(result.isError).toBe(false);
    });

    it('should update class active status', async () => {
      const mockUpdated = { Id: '123', Active: false };
      mockQuickBooksInstance.updateClass.mockImplementation((payload: any, cb: any) => cb(null, mockUpdated));

      const result = await updateQuickbooksClass({ id: '123', sync_token: '0', active: false });

      expect(result.isError).toBe(false);
    });

    it('should handle API errors', async () => {
      mockQuickBooksInstance.updateClass.mockImplementation((payload: any, cb: any) =>
        cb(new Error('Update failed'), null)
      );

      const result = await updateQuickbooksClass({ id: '123', sync_token: '0', name: 'Test' });

      expect(result.isError).toBe(true);
    });

    it('should handle authentication errors', async () => {
      (mockGetQuickbooks as any).mockRejectedValue(new Error('Auth failed'));

      const result = await updateQuickbooksClass({ id: '123', sync_token: '0', name: 'Test' });

      expect(result.isError).toBe(true);
      expect(result.error).toContain('Auth failed');
    });
  });

  describe('searchQuickbooksClasses', () => {
    it('should search classes', async () => {
      const mockClasses = [{ Id: '1', Name: 'A' }, { Id: '2', Name: 'B' }];
      mockQuickBooksInstance.findClasses.mockImplementation((criteria: any, cb: any) =>
        cb(null, { QueryResponse: { Class: mockClasses } })
      );

      const result = await searchQuickbooksClasses({});

      expect(result.isError).toBe(false);
      expect(result.result).toEqual(mockClasses);
    });

    it('should search with filters', async () => {
      mockQuickBooksInstance.findClasses.mockImplementation((criteria: any, cb: any) =>
        cb(null, { QueryResponse: { Class: [] } })
      );

      const result = await searchQuickbooksClasses({ name: 'Marketing', active: true, limit: 10 });

      expect(result.isError).toBe(false);
    });

    it('should handle empty QueryResponse', async () => {
      mockQuickBooksInstance.findClasses.mockImplementation((criteria: any, cb: any) =>
        cb(null, { QueryResponse: {} })
      );

      const result = await searchQuickbooksClasses({ limit: 5 });

      expect(result.isError).toBe(false);
      expect(result.result).toEqual([]);
    });

    it('should handle API errors', async () => {
      mockQuickBooksInstance.findClasses.mockImplementation((criteria: any, cb: any) =>
        cb(new Error('Search failed'), null)
      );

      const result = await searchQuickbooksClasses({});

      expect(result.isError).toBe(true);
    });

    it('should handle authentication errors', async () => {
      (mockGetQuickbooks as any).mockRejectedValue(new Error('Auth failed'));

      const result = await searchQuickbooksClasses({});

      expect(result.isError).toBe(true);
      expect(result.error).toContain('Auth failed');
    });
  });

  describe('createQuickbooksClass', () => {
    it('should handle authentication errors', async () => {
      (mockGetQuickbooks as any).mockRejectedValue(new Error('Auth failed'));

      const result = await createQuickbooksClass({ name: 'Test' });

      expect(result.isError).toBe(true);
      expect(result.error).toContain('Auth failed');
    });
  });
});
