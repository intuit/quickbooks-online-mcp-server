/**
 * Prototype-shape contract test for delete-vendor.
 *
 * QuickBooks Online does not support deleting a Vendor; a vendor is removed by
 * marking it inactive. node-quickbooks therefore has no deleteVendor method.
 * This test runs the handler against the real node-quickbooks prototype (not
 * the hand-rolled mock, which defines every method) so a call to a method the
 * library does not expose fails here instead of at runtime.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import QuickBooks from 'node-quickbooks';

let mockQbInstance: QuickBooks;

const mockQuickbooksClientClass = {
  getInstance: jest.fn<() => Promise<QuickBooks>>(),
};

jest.unstable_mockModule('../../../src/clients/quickbooks-client', () => ({
  quickbooksClient: {
    authenticate: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    getQuickbooks: jest.fn<() => QuickBooks>(),
  },
  QuickbooksClient: mockQuickbooksClientClass,
}));

const { deleteQuickbooksVendor } = await import('../../../src/handlers/delete-quickbooks-vendor.handler');

describe('delete-vendor prototype-shape contract', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    mockQbInstance = Object.create(QuickBooks.prototype) as QuickBooks;
    (mockQuickbooksClientClass.getInstance as any).mockResolvedValue(mockQbInstance);
  });

  it('node-quickbooks exposes updateVendor but no deleteVendor', () => {
    expect(typeof (QuickBooks.prototype as any).updateVendor).toBe('function');
    expect((QuickBooks.prototype as any).deleteVendor).toBeUndefined();
  });

  it('marks the vendor inactive with a sparse update on the real prototype', async () => {
    const inactive = { Id: '56', SyncToken: '4', DisplayName: 'Acme Corp', Active: false };
    const spy = jest
      .spyOn(QuickBooks.prototype as any, 'updateVendor')
      .mockImplementation(function (this: unknown, _vendor: any, cb: any) {
        cb(null, inactive);
      });

    const result = await deleteQuickbooksVendor({ Id: '56', SyncToken: '3' });

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toEqual({ Id: '56', SyncToken: '3', Active: false, sparse: true });
    expect(result.isError).toBe(false);
    expect(result.result).toEqual(inactive);
  });
});
