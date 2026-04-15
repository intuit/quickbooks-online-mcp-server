import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { mockGetQuickbooks, mockQuickBooksInstance, resetAllMocks } from '../../mocks/quickbooks.mock';

// ESM-compatible module mocking
jest.unstable_mockModule('../../../src/clients/quickbooks-client', () => ({
  getQuickbooks: mockGetQuickbooks,
}));

// Dynamic imports after mock setup
const { createQuickbooksTimeActivity } = await import('../../../src/handlers/create-quickbooks-time-activity.handler');
const { getQuickbooksTimeActivity } = await import('../../../src/handlers/get-quickbooks-time-activity.handler');
const { updateQuickbooksTimeActivity } = await import('../../../src/handlers/update-quickbooks-time-activity.handler');
const { deleteQuickbooksTimeActivity } = await import('../../../src/handlers/delete-quickbooks-time-activity.handler');
const { searchQuickbooksTimeActivities } = await import('../../../src/handlers/search-quickbooks-time-activities.handler');

describe('TimeActivity Handlers', () => {
  beforeEach(() => {
    resetAllMocks();
  });

  describe('createQuickbooksTimeActivity', () => {
    it('should create a time activity for vendor', async () => {
      const mockActivity = { Id: '123', Hours: 8 };
      mockQuickBooksInstance.createTimeActivity.mockImplementation((payload: any, cb: any) => cb(null, mockActivity));

      const result = await createQuickbooksTimeActivity({
        name_of: 'Vendor',
        vendor_ref: 'vendor-1',
        hours: 8
      });

      expect(result.isError).toBe(false);
      expect(result.result).toEqual(mockActivity);
    });

    it('should create a time activity for employee', async () => {
      const mockActivity = { Id: '124', Hours: 4 };
      mockQuickBooksInstance.createTimeActivity.mockImplementation((payload: any, cb: any) => cb(null, mockActivity));

      const result = await createQuickbooksTimeActivity({
        name_of: 'Employee',
        employee_ref: 'emp-1',
        hours: 4,
        billable_status: 'Billable'
      });

      expect(result.isError).toBe(false);
    });

    it('should handle errors', async () => {
      mockQuickBooksInstance.createTimeActivity.mockImplementation((payload: any, cb: any) =>
        cb(new Error('Invalid data'), null)
      );

      const result = await createQuickbooksTimeActivity({ name_of: 'Vendor' });

      expect(result.isError).toBe(true);
    });

    it('should handle authentication errors', async () => {
      (mockGetQuickbooks as any).mockRejectedValue(new Error('Auth failed'));

      const result = await createQuickbooksTimeActivity({ name_of: 'Vendor' });

      expect(result.isError).toBe(true);
      expect(result.error).toContain('Auth failed');
    });

    it('should create with all optional fields', async () => {
      const mockActivity = { Id: '125', Hours: 8 };
      mockQuickBooksInstance.createTimeActivity.mockImplementation((payload: any, cb: any) => cb(null, mockActivity));

      const result = await createQuickbooksTimeActivity({
        name_of: 'Employee',
        employee_ref: 'emp-1',
        customer_ref: 'cust-1',
        item_ref: 'item-1',
        hours: 8,
        minutes: 30,
        start_time: '2024-01-15T09:00:00',
        end_time: '2024-01-15T17:30:00',
        txn_date: '2024-01-15',
        description: 'Project work',
        billable_status: 'Billable',
        hourly_rate: 75
      });

      expect(result.isError).toBe(false);
      expect(result.result).toEqual(mockActivity);
    });
  });

  describe('getQuickbooksTimeActivity', () => {
    it('should get a time activity by ID', async () => {
      const mockActivity = { Id: '123', Hours: 8 };
      mockQuickBooksInstance.getTimeActivity.mockImplementation((_id: any, cb: any) => cb(null, mockActivity));

      const result = await getQuickbooksTimeActivity('123');

      expect(result.isError).toBe(false);
      expect(result.result).toEqual(mockActivity);
    });

    it('should handle API errors', async () => {
      mockQuickBooksInstance.getTimeActivity.mockImplementation((_id: any, cb: any) =>
        cb(new Error('Not found'), null)
      );

      const result = await getQuickbooksTimeActivity('999');

      expect(result.isError).toBe(true);
    });

    it('should handle authentication errors', async () => {
      (mockGetQuickbooks as any).mockRejectedValue(new Error('Auth failed'));

      const result = await getQuickbooksTimeActivity('123');

      expect(result.isError).toBe(true);
      expect(result.error).toContain('Auth failed');
    });
  });

  describe('updateQuickbooksTimeActivity', () => {
    it('should update a time activity', async () => {
      const mockUpdated = { Id: '123', Hours: 10 };
      mockQuickBooksInstance.updateTimeActivity.mockImplementation((payload: any, cb: any) => cb(null, mockUpdated));

      const result = await updateQuickbooksTimeActivity({ id: '123', sync_token: '0', hours: 10 });

      expect(result.isError).toBe(false);
    });

    it('should update a time activity with all optional fields', async () => {
      const mockUpdated = { Id: '123', Hours: 8, Minutes: 30, Description: 'Updated task' };
      mockQuickBooksInstance.updateTimeActivity.mockImplementation((payload: any, cb: any) => cb(null, mockUpdated));

      const result = await updateQuickbooksTimeActivity({
        id: '123',
        sync_token: '0',
        hours: 8,
        minutes: 30,
        description: 'Updated task',
        billable_status: 'Billable'
      });

      expect(result.isError).toBe(false);
    });

    it('should handle API errors', async () => {
      mockQuickBooksInstance.updateTimeActivity.mockImplementation((payload: any, cb: any) =>
        cb(new Error('Update failed'), null)
      );

      const result = await updateQuickbooksTimeActivity({ id: '123', sync_token: '0' });

      expect(result.isError).toBe(true);
    });

    it('should handle authentication errors', async () => {
      (mockGetQuickbooks as any).mockRejectedValue(new Error('Auth failed'));

      const result = await updateQuickbooksTimeActivity({ id: '123', sync_token: '0' });

      expect(result.isError).toBe(true);
      expect(result.error).toContain('Auth failed');
    });
  });

  describe('deleteQuickbooksTimeActivity', () => {
    it('should delete a time activity', async () => {
      mockQuickBooksInstance.deleteTimeActivity.mockImplementation((payload: any, cb: any) => cb(null, {}));

      const result = await deleteQuickbooksTimeActivity({ id: '123', sync_token: '0' });

      expect(result.isError).toBe(false);
    });

    it('should handle API errors', async () => {
      mockQuickBooksInstance.deleteTimeActivity.mockImplementation((payload: any, cb: any) =>
        cb(new Error('Delete failed'), null)
      );

      const result = await deleteQuickbooksTimeActivity({ id: '123', sync_token: '0' });

      expect(result.isError).toBe(true);
    });

    it('should handle authentication errors', async () => {
      (mockGetQuickbooks as any).mockRejectedValue(new Error('Auth failed'));

      const result = await deleteQuickbooksTimeActivity({ id: '123', sync_token: '0' });

      expect(result.isError).toBe(true);
      expect(result.error).toContain('Auth failed');
    });
  });

  describe('searchQuickbooksTimeActivities', () => {
    it('should search time activities', async () => {
      const mockActivities = [{ Id: '1' }, { Id: '2' }];
      mockQuickBooksInstance.findTimeActivities.mockImplementation((criteria: any, cb: any) =>
        cb(null, { QueryResponse: { TimeActivity: mockActivities } })
      );

      const result = await searchQuickbooksTimeActivities({});

      expect(result.isError).toBe(false);
      expect(result.result).toEqual(mockActivities);
    });

    it('should handle API errors', async () => {
      mockQuickBooksInstance.findTimeActivities.mockImplementation((criteria: any, cb: any) =>
        cb(new Error('Search failed'), null)
      );

      const result = await searchQuickbooksTimeActivities({});

      expect(result.isError).toBe(true);
    });

    it('should handle authentication errors', async () => {
      (mockGetQuickbooks as any).mockRejectedValue(new Error('Auth failed'));

      const result = await searchQuickbooksTimeActivities({});

      expect(result.isError).toBe(true);
      expect(result.error).toContain('Auth failed');
    });

    it('should search with all filter options', async () => {
      mockQuickBooksInstance.findTimeActivities.mockImplementation((criteria: any, cb: any) =>
        cb(null, { QueryResponse: { TimeActivity: [] } })
      );

      const result = await searchQuickbooksTimeActivities({
        employee_ref: 'emp-1',
        vendor_ref: 'vendor-1',
        customer_ref: 'cust-1',
        txn_date_from: '2024-01-01',
        txn_date_to: '2024-12-31',
        limit: 50
      });

      expect(result.isError).toBe(false);
    });

    it('should handle empty QueryResponse', async () => {
      mockQuickBooksInstance.findTimeActivities.mockImplementation((criteria: any, cb: any) =>
        cb(null, { QueryResponse: {} })
      );

      const result = await searchQuickbooksTimeActivities({ limit: 5 });

      expect(result.isError).toBe(false);
      expect(result.result).toEqual([]);
    });
  });
});
