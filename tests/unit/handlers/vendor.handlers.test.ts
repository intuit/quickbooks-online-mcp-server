import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { mockQuickbooksClient, mockQuickBooksInstance, resetAllMocks } from '../../mocks/quickbooks.mock';

// ESM-compatible module mocking
jest.unstable_mockModule('../../../src/clients/quickbooks-client', () => ({
  quickbooksClient: mockQuickbooksClient,
}));

// Dynamic imports after mock setup
const { createQuickbooksVendor } = await import('../../../src/handlers/create-quickbooks-vendor.handler');
const { getQuickbooksVendor } = await import('../../../src/handlers/get-quickbooks-vendor.handler');
const { updateQuickbooksVendor } = await import('../../../src/handlers/update-quickbooks-vendor.handler');
const { deleteQuickbooksVendor } = await import('../../../src/handlers/delete-quickbooks-vendor.handler');
const { searchQuickbooksVendors } = await import('../../../src/handlers/search-quickbooks-vendors.handler');

describe('Vendor Handlers', () => {
  beforeEach(() => {
    resetAllMocks();
  });

  describe('createQuickbooksVendor', () => {
    it('should create a vendor successfully', async () => {
      const mockVendor = { Id: '56', DisplayName: 'Acme Corp' };
      mockQuickBooksInstance.createVendor.mockImplementation((_payload: any, cb: any) => cb(null, mockVendor));

      const result = await createQuickbooksVendor({
        DisplayName: 'Acme Corp',
        CompanyName: 'Acme Corp',
      });

      expect(result.isError).toBe(false);
      expect(result.result).toEqual(mockVendor);
    });

    it('should handle API errors', async () => {
      mockQuickBooksInstance.createVendor.mockImplementation((_payload: any, cb: any) =>
        cb(new Error('SAXParseException: Premature end of file'), null)
      );

      const result = await createQuickbooksVendor({});

      expect(result.isError).toBe(true);
    });

    it('should handle authentication errors', async () => {
      (mockQuickbooksClient.authenticate as any).mockRejectedValue(new Error('Auth failed'));

      const result = await createQuickbooksVendor({});

      expect(result.isError).toBe(true);
      expect(result.error).toContain('Error: Auth failed');
    });
  });

  describe('getQuickbooksVendor', () => {
    it('should get a vendor by ID', async () => {
      const mockVendor = { Id: '56', DisplayName: 'Acme Corp' };
      mockQuickBooksInstance.getVendor.mockImplementation((_id: any, cb: any) => cb(null, mockVendor));

      const result = await getQuickbooksVendor('56');

      expect(result.isError).toBe(false);
      expect(result.result).toEqual(mockVendor);
    });

    it('should handle API errors', async () => {
      mockQuickBooksInstance.getVendor.mockImplementation((_id: any, cb: any) =>
        cb(new Error('Not found'), null)
      );

      const result = await getQuickbooksVendor('999');

      expect(result.isError).toBe(true);
    });

    it('should handle authentication errors', async () => {
      (mockQuickbooksClient.authenticate as any).mockRejectedValue(new Error('Auth failed'));

      const result = await getQuickbooksVendor('56');

      expect(result.isError).toBe(true);
      expect(result.error).toContain('Error: Auth failed');
    });
  });

  describe('updateQuickbooksVendor', () => {
    it('should update a vendor', async () => {
      const mockUpdated = { Id: '56', DisplayName: 'Acme Corp Updated', SyncToken: '1' };
      mockQuickBooksInstance.updateVendor.mockImplementation((_payload: any, cb: any) => cb(null, mockUpdated));

      const result = await updateQuickbooksVendor({ Id: '56', SyncToken: '0', DisplayName: 'Acme Corp Updated' });

      expect(result.isError).toBe(false);
      expect(result.result).toEqual(mockUpdated);
    });

    it('should handle API errors', async () => {
      mockQuickBooksInstance.updateVendor.mockImplementation((_payload: any, cb: any) =>
        cb(new Error('Update failed'), null)
      );

      const result = await updateQuickbooksVendor({ Id: '56', SyncToken: '0' });

      expect(result.isError).toBe(true);
    });

    it('should handle authentication errors', async () => {
      (mockQuickbooksClient.authenticate as any).mockRejectedValue(new Error('Auth failed'));

      const result = await updateQuickbooksVendor({ Id: '56', SyncToken: '0' });

      expect(result.isError).toBe(true);
      expect(result.error).toContain('Error: Auth failed');
    });
  });

  describe('deleteQuickbooksVendor', () => {
    it('should delete a vendor', async () => {
      const mockDeleted = { Id: '56', status: 'Deleted' };
      mockQuickBooksInstance.deleteVendor.mockImplementation((_payload: any, cb: any) => cb(null, mockDeleted));

      const result = await deleteQuickbooksVendor({ Id: '56', SyncToken: '0' });

      expect(result.isError).toBe(false);
      expect(result.result).toEqual(mockDeleted);
    });

    it('should handle API errors', async () => {
      mockQuickBooksInstance.deleteVendor.mockImplementation((_payload: any, cb: any) =>
        cb(new Error('Delete failed'), null)
      );

      const result = await deleteQuickbooksVendor({ Id: '56', SyncToken: '0' });

      expect(result.isError).toBe(true);
    });

    it('should handle authentication errors', async () => {
      (mockQuickbooksClient.authenticate as any).mockRejectedValue(new Error('Auth failed'));

      const result = await deleteQuickbooksVendor({ Id: '56', SyncToken: '0' });

      expect(result.isError).toBe(true);
      expect(result.error).toContain('Error: Auth failed');
    });
  });

  describe('searchQuickbooksVendors', () => {
    it('should search vendors', async () => {
      const mockVendors = [{ Id: '56', DisplayName: 'Acme' }, { Id: '57', DisplayName: 'Globex' }];
      mockQuickBooksInstance.findVendors.mockImplementation((_criteria: any, cb: any) =>
        cb(null, { QueryResponse: { Vendor: mockVendors } })
      );

      const result = await searchQuickbooksVendors({});

      expect(result.isError).toBe(false);
      expect(result.result).toEqual(mockVendors);
    });

    it('should search vendors with array criteria', async () => {
      mockQuickBooksInstance.findVendors.mockImplementation((_criteria: any, cb: any) =>
        cb(null, { QueryResponse: { Vendor: [{ Id: '56', DisplayName: 'Acme' }] } })
      );

      const result = await searchQuickbooksVendors([
        { field: 'DisplayName', value: 'Acme', operator: 'LIKE' },
      ]);

      expect(result.isError).toBe(false);
      expect(result.result).toHaveLength(1);
    });

    it('should use default empty criteria when none provided', async () => {
      mockQuickBooksInstance.findVendors.mockImplementation((_criteria: any, cb: any) =>
        cb(null, { QueryResponse: { Vendor: [] } })
      );

      const result = await searchQuickbooksVendors();

      expect(result.isError).toBe(false);
      expect(result.result).toEqual([]);
    });

    it('should return totalCount for count queries', async () => {
      mockQuickBooksInstance.findVendors.mockImplementation((_criteria: any, cb: any) =>
        cb(null, { QueryResponse: { totalCount: 15 } })
      );

      const result = await searchQuickbooksVendors({});

      expect(result.isError).toBe(false);
      expect(result.result).toBe(15);
    });

    it('should handle empty QueryResponse', async () => {
      mockQuickBooksInstance.findVendors.mockImplementation((_criteria: any, cb: any) =>
        cb(null, { QueryResponse: {} })
      );

      const result = await searchQuickbooksVendors({});

      expect(result.isError).toBe(false);
      expect(result.result).toEqual([]);
    });

    it('should handle API errors', async () => {
      mockQuickBooksInstance.findVendors.mockImplementation((_criteria: any, cb: any) =>
        cb(new Error('Search failed'), null)
      );

      const result = await searchQuickbooksVendors({});

      expect(result.isError).toBe(true);
    });

    it('should handle authentication errors', async () => {
      (mockQuickbooksClient.authenticate as any).mockRejectedValue(new Error('Auth failed'));

      const result = await searchQuickbooksVendors({});

      expect(result.isError).toBe(true);
      expect(result.error).toContain('Error: Auth failed');
    });
  });
});
