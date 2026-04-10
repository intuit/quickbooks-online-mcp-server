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
const { createQuickbooksBill } = await import('../../../src/handlers/create-quickbooks-bill.handler');
const { getQuickbooksBill } = await import('../../../src/handlers/get-quickbooks-bill.handler');
const { updateQuickbooksBill } = await import('../../../src/handlers/update-quickbooks-bill.handler');
const { deleteQuickbooksBill } = await import('../../../src/handlers/delete-quickbooks-bill.handler');
const { searchQuickbooksBills } = await import('../../../src/handlers/search-quickbooks-bills.handler');

describe('Vendor and Bill Handlers', () => {
  beforeEach(() => {
    resetAllMocks();
  });

  // ---------------------------------------------------------------------------
  // Vendor Handlers
  // ---------------------------------------------------------------------------

  describe('createQuickbooksVendor', () => {
    it('should create a vendor successfully', async () => {
      mockQuickBooksInstance.createVendor.mockImplementation((payload: any, cb: any) =>
        cb(null, { Id: '1', DisplayName: 'Acme Corp' })
      );

      const result = await createQuickbooksVendor({ DisplayName: 'Acme Corp' });

      expect(result.isError).toBe(false);
      expect(result.result).toMatchObject({ Id: '1' });
    });

    it('should return an error on authentication failure', async () => {
      (mockQuickbooksClient.authenticate as any).mockRejectedValue(new Error('Auth failed'));

      const result = await createQuickbooksVendor({ DisplayName: 'Acme Corp' });

      expect(result.isError).toBe(true);
      expect(result.error).toContain('Auth failed');
    });

    it('should return an error on QBO API failure', async () => {
      mockQuickBooksInstance.createVendor.mockImplementation((payload: any, cb: any) =>
        cb(new Error('Create failed'), null)
      );

      const result = await createQuickbooksVendor({ DisplayName: 'Acme Corp' });

      expect(result.isError).toBe(true);
      expect(result.error).toContain('Create failed');
    });
  });

  describe('getQuickbooksVendor', () => {
    it('should get a vendor by ID successfully', async () => {
      mockQuickBooksInstance.getVendor.mockImplementation((id: any, cb: any) =>
        cb(null, { Id: id, DisplayName: 'Acme Corp' })
      );

      const result = await getQuickbooksVendor('42');

      expect(result.isError).toBe(false);
      expect(result.result).toMatchObject({ Id: '42' });
    });

    it('should return an error on authentication failure', async () => {
      (mockQuickbooksClient.authenticate as any).mockRejectedValue(new Error('Auth failed'));

      const result = await getQuickbooksVendor('42');

      expect(result.isError).toBe(true);
      expect(result.error).toContain('Auth failed');
    });

    it('should return an error when vendor is not found', async () => {
      mockQuickBooksInstance.getVendor.mockImplementation((id: any, cb: any) =>
        cb(new Error('Not found'), null)
      );

      const result = await getQuickbooksVendor('999');

      expect(result.isError).toBe(true);
      expect(result.error).toContain('Not found');
    });
  });

  describe('updateQuickbooksVendor', () => {
    it('should update a vendor successfully', async () => {
      mockQuickBooksInstance.updateVendor.mockImplementation((payload: any, cb: any) =>
        cb(null, { Id: '1', DisplayName: 'Updated Corp', SyncToken: '1' })
      );

      const result = await updateQuickbooksVendor({
        Id: '1',
        SyncToken: '0',
        DisplayName: 'Updated Corp',
      });

      expect(result.isError).toBe(false);
      expect(result.result).toMatchObject({ SyncToken: '1' });
    });

    it('should return an error on authentication failure', async () => {
      (mockQuickbooksClient.authenticate as any).mockRejectedValue(new Error('Auth failed'));

      const result = await updateQuickbooksVendor({ Id: '1', SyncToken: '0' });

      expect(result.isError).toBe(true);
      expect(result.error).toContain('Auth failed');
    });

    it('should return an error on QBO API failure', async () => {
      mockQuickBooksInstance.updateVendor.mockImplementation((payload: any, cb: any) =>
        cb(new Error('Update failed'), null)
      );

      const result = await updateQuickbooksVendor({ Id: '1', SyncToken: '0' });

      expect(result.isError).toBe(true);
      expect(result.error).toContain('Update failed');
    });
  });

  describe('deleteQuickbooksVendor', () => {
    it('should delete a vendor successfully', async () => {
      mockQuickBooksInstance.deleteVendor.mockImplementation((payload: any, cb: any) =>
        cb(null, { Id: '1', status: 'Deleted' })
      );

      const result = await deleteQuickbooksVendor({ Id: '1', SyncToken: '0' });

      expect(result.isError).toBe(false);
    });

    it('should return an error on authentication failure', async () => {
      (mockQuickbooksClient.authenticate as any).mockRejectedValue(new Error('Auth failed'));

      const result = await deleteQuickbooksVendor({ Id: '1', SyncToken: '0' });

      expect(result.isError).toBe(true);
      expect(result.error).toContain('Auth failed');
    });

    it('should return an error on QBO API failure', async () => {
      mockQuickBooksInstance.deleteVendor.mockImplementation((payload: any, cb: any) =>
        cb(new Error('Delete failed'), null)
      );

      const result = await deleteQuickbooksVendor({ Id: '1', SyncToken: '0' });

      expect(result.isError).toBe(true);
      expect(result.error).toContain('Delete failed');
    });
  });

  describe('searchQuickbooksVendors', () => {
    it('should search vendors with default criteria', async () => {
      mockQuickBooksInstance.findVendors.mockImplementation((criteria: any, cb: any) =>
        cb(null, { QueryResponse: { Vendor: [{ Id: '1' }] } })
      );

      const result = await searchQuickbooksVendors();

      expect(result.isError).toBe(false);
    });

    it('should search vendors with criteria object', async () => {
      mockQuickBooksInstance.findVendors.mockImplementation((criteria: any, cb: any) =>
        cb(null, { QueryResponse: { Vendor: [{ Id: '1', DisplayName: 'Acme' }] } })
      );

      const result = await searchQuickbooksVendors({ DisplayName: 'Acme' });

      expect(result.isError).toBe(false);
    });

    it('should return an error on authentication failure', async () => {
      (mockQuickbooksClient.authenticate as any).mockRejectedValue(new Error('Auth failed'));

      const result = await searchQuickbooksVendors();

      expect(result.isError).toBe(true);
      expect(result.error).toContain('Auth failed');
    });
  });

  // ---------------------------------------------------------------------------
  // Bill Handlers
  // ---------------------------------------------------------------------------

  describe('createQuickbooksBill', () => {
    const sampleBill = {
      Line: [{ Amount: 100, DetailType: 'AccountBasedExpenseLineDetail', AccountRef: { value: '1' } }],
      VendorRef: { value: '42' },
    };

    it('should create a bill successfully', async () => {
      mockQuickBooksInstance.createBill.mockImplementation((payload: any, cb: any) =>
        cb(null, { Id: '10', TotalAmt: 100 })
      );

      const result = await createQuickbooksBill(sampleBill);

      expect(result.isError).toBe(false);
      expect(result.result).toMatchObject({ Id: '10' });
    });

    it('should return an error on authentication failure', async () => {
      (mockQuickbooksClient.authenticate as any).mockRejectedValue(new Error('Auth failed'));

      const result = await createQuickbooksBill(sampleBill);

      expect(result.isError).toBe(true);
      expect(result.error).toContain('Auth failed');
    });

    it('should return an error on QBO API failure', async () => {
      mockQuickBooksInstance.createBill.mockImplementation((payload: any, cb: any) =>
        cb(new Error('Create failed'), null)
      );

      const result = await createQuickbooksBill(sampleBill);

      expect(result.isError).toBe(true);
      expect(result.error).toContain('Create failed');
    });
  });

  describe('getQuickbooksBill', () => {
    it('should get a bill by ID successfully', async () => {
      mockQuickBooksInstance.getBill.mockImplementation((id: any, cb: any) =>
        cb(null, { Id: id, TotalAmt: 200 })
      );

      const result = await getQuickbooksBill('10');

      expect(result.isError).toBe(false);
      expect(result.result).toMatchObject({ Id: '10' });
    });

    it('should return an error on authentication failure', async () => {
      (mockQuickbooksClient.authenticate as any).mockRejectedValue(new Error('Auth failed'));

      const result = await getQuickbooksBill('10');

      expect(result.isError).toBe(true);
      expect(result.error).toContain('Auth failed');
    });

    it('should return an error when bill is not found', async () => {
      mockQuickBooksInstance.getBill.mockImplementation((id: any, cb: any) =>
        cb(new Error('Not found'), null)
      );

      const result = await getQuickbooksBill('999');

      expect(result.isError).toBe(true);
      expect(result.error).toContain('Not found');
    });
  });

  describe('updateQuickbooksBill', () => {
    it('should update a bill successfully', async () => {
      mockQuickBooksInstance.updateBill.mockImplementation((payload: any, cb: any) =>
        cb(null, { Id: '10', SyncToken: '1', TotalAmt: 150 })
      );

      const result = await updateQuickbooksBill({ Id: '10', SyncToken: '0', TotalAmt: 150 });

      expect(result.isError).toBe(false);
      expect(result.result).toMatchObject({ SyncToken: '1' });
    });

    it('should return an error on authentication failure', async () => {
      (mockQuickbooksClient.authenticate as any).mockRejectedValue(new Error('Auth failed'));

      const result = await updateQuickbooksBill({ Id: '10', SyncToken: '0' });

      expect(result.isError).toBe(true);
      expect(result.error).toContain('Auth failed');
    });

    it('should return an error on QBO API failure', async () => {
      mockQuickBooksInstance.updateBill.mockImplementation((payload: any, cb: any) =>
        cb(new Error('Update failed'), null)
      );

      const result = await updateQuickbooksBill({ Id: '10', SyncToken: '0' });

      expect(result.isError).toBe(true);
      expect(result.error).toContain('Update failed');
    });
  });

  describe('deleteQuickbooksBill', () => {
    it('should delete a bill successfully', async () => {
      mockQuickBooksInstance.deleteBill.mockImplementation((payload: any, cb: any) =>
        cb(null, { Id: '10', status: 'Deleted' })
      );

      const result = await deleteQuickbooksBill({ Id: '10', SyncToken: '0' });

      expect(result.isError).toBe(false);
    });

    it('should return an error on authentication failure', async () => {
      (mockQuickbooksClient.authenticate as any).mockRejectedValue(new Error('Auth failed'));

      const result = await deleteQuickbooksBill({ Id: '10', SyncToken: '0' });

      expect(result.isError).toBe(true);
      expect(result.error).toContain('Auth failed');
    });

    it('should return an error on QBO API failure', async () => {
      mockQuickBooksInstance.deleteBill.mockImplementation((payload: any, cb: any) =>
        cb(new Error('Delete failed'), null)
      );

      const result = await deleteQuickbooksBill({ Id: '10', SyncToken: '0' });

      expect(result.isError).toBe(true);
      expect(result.error).toContain('Delete failed');
    });
  });

  describe('searchQuickbooksBills', () => {
    it('should search bills with default criteria', async () => {
      mockQuickBooksInstance.findBills.mockImplementation((criteria: any, cb: any) =>
        cb(null, { QueryResponse: { Bill: [{ Id: '10' }] } })
      );

      const result = await searchQuickbooksBills();

      expect(result.isError).toBe(false);
    });

    it('should search bills with criteria object', async () => {
      mockQuickBooksInstance.findBills.mockImplementation((criteria: any, cb: any) =>
        cb(null, { QueryResponse: { Bill: [{ Id: '10' }] } })
      );

      const result = await searchQuickbooksBills({ VendorRef: '42' });

      expect(result.isError).toBe(false);
    });

    it('should return an error on authentication failure', async () => {
      (mockQuickbooksClient.authenticate as any).mockRejectedValue(new Error('Auth failed'));

      const result = await searchQuickbooksBills();

      expect(result.isError).toBe(true);
      expect(result.error).toContain('Auth failed');
    });
  });
});
