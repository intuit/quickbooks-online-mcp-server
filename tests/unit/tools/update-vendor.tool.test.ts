import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { mockQuickbooksClient, mockQuickbooksClientClass, mockQuickBooksInstance, resetAllMocks } from '../../mocks/quickbooks.mock';

// The tool module imports its handler, which imports the quickbooks-client.
// Mock the client so importing the tool doesn't spin up real auth/config.
jest.unstable_mockModule('../../../src/clients/quickbooks-client', () => ({
  quickbooksClient: mockQuickbooksClient,
  QuickbooksClient: mockQuickbooksClientClass,
}));

const { UpdateVendorTool } = await import('../../../src/tools/update-vendor.tool');

// Vendors cannot be deleted in QuickBooks Online, only made inactive, so update-vendor
// must accept and forward Active.
describe('update-vendor Active', () => {
  beforeEach(() => {
    resetAllMocks();
  });

  it('keeps Active in the parsed params', () => {
    const result = UpdateVendorTool.schema.safeParse({
      vendor: { Id: '72', SyncToken: '1', DisplayName: 'Acme', Active: false },
    });
    expect(result.success).toBe(true);
    expect(result.success && result.data.vendor.Active).toBe(false);
  });

  it('sends Active to QuickBooks', async () => {
    mockQuickBooksInstance.updateVendor.mockImplementation((payload: any, cb: any) => cb(null, { ...payload, SyncToken: '2' }));
    const params = { vendor: { Id: '72', SyncToken: '1', DisplayName: 'Acme', Active: false } };

    const result = await UpdateVendorTool.handler({ params } as any, {} as any);

    expect(mockQuickBooksInstance.updateVendor).toHaveBeenCalledWith(
      expect.objectContaining({ Id: '72', Active: false }),
      expect.any(Function),
    );
    expect(JSON.parse((result as any).content[0].text).Active).toBe(false);
  });

  it('reports a QuickBooks error', async () => {
    mockQuickBooksInstance.updateVendor.mockImplementation((payload: any, cb: any) => cb(new Error('Stale object')));
    const params = { vendor: { Id: '72', SyncToken: '0', DisplayName: 'Acme', Active: false } };

    const result = await UpdateVendorTool.handler({ params } as any, {} as any);

    expect((result as any).content[0].text).toContain('Error updating vendor');
  });
});
