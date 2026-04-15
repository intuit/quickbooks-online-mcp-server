import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { mockGetQuickbooks, mockQuickBooksInstance, resetAllMocks } from '../../mocks/quickbooks.mock';

// ESM-compatible module mocking
jest.unstable_mockModule('../../../src/clients/quickbooks-client', () => ({
  getQuickbooks: mockGetQuickbooks,
}));

// Dynamic imports after mock setup
const { createQuickbooksRefundReceipt } = await import('../../../src/handlers/create-quickbooks-refund-receipt.handler');
const { getQuickbooksRefundReceipt } = await import('../../../src/handlers/get-quickbooks-refund-receipt.handler');
const { updateQuickbooksRefundReceipt } = await import('../../../src/handlers/update-quickbooks-refund-receipt.handler');
const { deleteQuickbooksRefundReceipt } = await import('../../../src/handlers/delete-quickbooks-refund-receipt.handler');
const { searchQuickbooksRefundReceipts } = await import('../../../src/handlers/search-quickbooks-refund-receipts.handler');
const { createQuickbooksPurchaseOrder } = await import('../../../src/handlers/create-quickbooks-purchase-order.handler');
const { getQuickbooksPurchaseOrder } = await import('../../../src/handlers/get-quickbooks-purchase-order.handler');
const { updateQuickbooksPurchaseOrder } = await import('../../../src/handlers/update-quickbooks-purchase-order.handler');
const { deleteQuickbooksPurchaseOrder } = await import('../../../src/handlers/delete-quickbooks-purchase-order.handler');
const { searchQuickbooksPurchaseOrders } = await import('../../../src/handlers/search-quickbooks-purchase-orders.handler');
const { createQuickbooksVendorCredit } = await import('../../../src/handlers/create-quickbooks-vendor-credit.handler');
const { getQuickbooksVendorCredit } = await import('../../../src/handlers/get-quickbooks-vendor-credit.handler');
const { updateQuickbooksVendorCredit } = await import('../../../src/handlers/update-quickbooks-vendor-credit.handler');
const { deleteQuickbooksVendorCredit } = await import('../../../src/handlers/delete-quickbooks-vendor-credit.handler');
const { searchQuickbooksVendorCredits } = await import('../../../src/handlers/search-quickbooks-vendor-credits.handler');

describe('Refund, PurchaseOrder, VendorCredit Handlers', () => {
  beforeEach(() => {
    resetAllMocks();
  });

  describe('RefundReceipt Handlers', () => {
    it('should create a refund receipt', async () => {
      mockQuickBooksInstance.createRefundReceipt.mockImplementation((payload: any, cb: any) => cb(null, { Id: '1' }));

      const result = await createQuickbooksRefundReceipt({
        customer_ref: 'cust-1',
        line_items: [{ item_ref: 'item-1', qty: 1, unit_price: 50 }]
      });

      expect(result.isError).toBe(false);
    });

    it('should create a refund receipt with all optional fields', async () => {
      mockQuickBooksInstance.createRefundReceipt.mockImplementation((payload: any, cb: any) => cb(null, { Id: '1' }));

      const result = await createQuickbooksRefundReceipt({
        customer_ref: 'cust-1',
        line_items: [{ item_ref: 'item-1', qty: 2, unit_price: 50, description: 'Refunded item' }],
        payment_method_ref: 'pm-1',
        deposit_to_account_ref: 'acc-1',
        txn_date: '2024-01-15',
        doc_number: 'RF-001',
        private_note: 'Test refund'
      });

      expect(result.isError).toBe(false);
    });

    it('should create a refund receipt - authentication error', async () => {
      (mockGetQuickbooks as any).mockRejectedValue(new Error('Auth failed'));

      const result = await createQuickbooksRefundReceipt({
        customer_ref: 'cust-1',
        line_items: [{ item_ref: 'item-1', qty: 1, unit_price: 50 }]
      });

      expect(result.isError).toBe(true);
      expect(result.error).toContain('Auth failed');
    });

    it('should create a refund receipt - API error', async () => {
      mockQuickBooksInstance.createRefundReceipt.mockImplementation((payload: any, cb: any) =>
        cb(new Error('Create failed'), null)
      );

      const result = await createQuickbooksRefundReceipt({
        customer_ref: 'cust-1',
        line_items: [{ item_ref: 'item-1', qty: 1, unit_price: 50 }]
      });

      expect(result.isError).toBe(true);
    });

    it('should get a refund receipt', async () => {
      mockQuickBooksInstance.getRefundReceipt.mockImplementation((_id: any, cb: any) => cb(null, { Id: '1' }));

      const result = await getQuickbooksRefundReceipt('1');

      expect(result.isError).toBe(false);
    });

    it('should get a refund receipt - authentication error', async () => {
      (mockGetQuickbooks as any).mockRejectedValue(new Error('Auth failed'));

      const result = await getQuickbooksRefundReceipt('1');

      expect(result.isError).toBe(true);
      expect(result.error).toContain('Auth failed');
    });

    it('should get a refund receipt - API error', async () => {
      mockQuickBooksInstance.getRefundReceipt.mockImplementation((_id: any, cb: any) =>
        cb(new Error('Not found'), null)
      );

      const result = await getQuickbooksRefundReceipt('999');

      expect(result.isError).toBe(true);
    });

    it('should update a refund receipt', async () => {
      mockQuickBooksInstance.updateRefundReceipt.mockImplementation((payload: any, cb: any) => cb(null, {}));

      const result = await updateQuickbooksRefundReceipt({ id: '1', sync_token: '0' });

      expect(result.isError).toBe(false);
    });

    it('should update with all optional fields', async () => {
      mockQuickBooksInstance.updateRefundReceipt.mockImplementation((payload: any, cb: any) => cb(null, {}));

      const result = await updateQuickbooksRefundReceipt({
        id: '1',
        sync_token: '0',
        customer_ref: 'cust-1',
        private_note: 'Updated refund note',
        doc_number: 'RF-002'
      });

      expect(result.isError).toBe(false);
    });

    it('should update a refund receipt - authentication error', async () => {
      (mockGetQuickbooks as any).mockRejectedValue(new Error('Auth failed'));

      const result = await updateQuickbooksRefundReceipt({ id: '1', sync_token: '0' });

      expect(result.isError).toBe(true);
      expect(result.error).toContain('Auth failed');
    });

    it('should update a refund receipt - API error', async () => {
      mockQuickBooksInstance.updateRefundReceipt.mockImplementation((payload: any, cb: any) =>
        cb(new Error('Update failed'), null)
      );

      const result = await updateQuickbooksRefundReceipt({ id: '1', sync_token: '0' });

      expect(result.isError).toBe(true);
    });

    it('should delete a refund receipt', async () => {
      mockQuickBooksInstance.deleteRefundReceipt.mockImplementation((payload: any, cb: any) => cb(null, {}));

      const result = await deleteQuickbooksRefundReceipt({ id: '1', sync_token: '0' });

      expect(result.isError).toBe(false);
    });

    it('should delete a refund receipt - authentication error', async () => {
      (mockGetQuickbooks as any).mockRejectedValue(new Error('Auth failed'));

      const result = await deleteQuickbooksRefundReceipt({ id: '1', sync_token: '0' });

      expect(result.isError).toBe(true);
      expect(result.error).toContain('Auth failed');
    });

    it('should delete a refund receipt - API error', async () => {
      mockQuickBooksInstance.deleteRefundReceipt.mockImplementation((payload: any, cb: any) =>
        cb(new Error('Delete failed'), null)
      );

      const result = await deleteQuickbooksRefundReceipt({ id: '1', sync_token: '0' });

      expect(result.isError).toBe(true);
    });

    it('should search refund receipts', async () => {
      mockQuickBooksInstance.findRefundReceipts.mockImplementation((criteria: any, cb: any) =>
        cb(null, { QueryResponse: { RefundReceipt: [{ Id: '1' }] } })
      );

      const result = await searchQuickbooksRefundReceipts({ customer_ref: 'cust-1', limit: 10 });

      expect(result.isError).toBe(false);
    });

    it('should search refund receipts - authentication error', async () => {
      (mockGetQuickbooks as any).mockRejectedValue(new Error('Auth failed'));

      const result = await searchQuickbooksRefundReceipts({});

      expect(result.isError).toBe(true);
      expect(result.error).toContain('Auth failed');
    });

    it('should search refund receipts - API error', async () => {
      mockQuickBooksInstance.findRefundReceipts.mockImplementation((criteria: any, cb: any) =>
        cb(new Error('Search failed'), null)
      );

      const result = await searchQuickbooksRefundReceipts({});

      expect(result.isError).toBe(true);
    });

    it('should search refund receipts with all filter options', async () => {
      mockQuickBooksInstance.findRefundReceipts.mockImplementation((criteria: any, cb: any) =>
        cb(null, { QueryResponse: { RefundReceipt: [] } })
      );

      const result = await searchQuickbooksRefundReceipts({
        customer_ref: 'cust-1',
        txn_date_from: '2024-01-01',
        txn_date_to: '2024-12-31',
        limit: 50
      });

      expect(result.isError).toBe(false);
    });

    it('should handle empty QueryResponse', async () => {
      mockQuickBooksInstance.findRefundReceipts.mockImplementation((criteria: any, cb: any) =>
        cb(null, { QueryResponse: {} })
      );

      const result = await searchQuickbooksRefundReceipts({ limit: 5 });

      expect(result.isError).toBe(false);
      expect(result.result).toEqual([]);
    });
  });

  describe('PurchaseOrder Handlers', () => {
    it('should create a purchase order', async () => {
      mockQuickBooksInstance.createPurchaseOrder.mockImplementation((payload: any, cb: any) => cb(null, { Id: '1' }));

      const result = await createQuickbooksPurchaseOrder({
        vendor_ref: 'vendor-1',
        line_items: [{ item_ref: 'item-1', qty: 1, unit_price: 100 }]
      });

      expect(result.isError).toBe(false);
    });

    it('should create a purchase order with all optional fields', async () => {
      mockQuickBooksInstance.createPurchaseOrder.mockImplementation((payload: any, cb: any) => cb(null, { Id: '1' }));

      const result = await createQuickbooksPurchaseOrder({
        vendor_ref: 'vendor-1',
        line_items: [
          { item_ref: 'item-1', qty: 2, unit_price: 100, description: 'Office supplies' }
        ],
        txn_date: '2024-01-15',
        doc_number: 'PO-2024-001',
        private_note: 'Rush order',
        ship_addr: {
          line1: '123 Main St',
          city: 'Anytown',
          country_sub_division_code: 'CA',
          postal_code: '12345'
        }
      });

      expect(result.isError).toBe(false);
    });

    it('should create a purchase order - authentication error', async () => {
      (mockGetQuickbooks as any).mockRejectedValue(new Error('Auth failed'));

      const result = await createQuickbooksPurchaseOrder({
        vendor_ref: 'vendor-1',
        line_items: [{ item_ref: 'item-1', qty: 1, unit_price: 100 }]
      });

      expect(result.isError).toBe(true);
      expect(result.error).toContain('Auth failed');
    });

    it('should create a purchase order - API error', async () => {
      mockQuickBooksInstance.createPurchaseOrder.mockImplementation((payload: any, cb: any) =>
        cb(new Error('Create failed'), null)
      );

      const result = await createQuickbooksPurchaseOrder({
        vendor_ref: 'vendor-1',
        line_items: [{ item_ref: 'item-1', qty: 1, unit_price: 100 }]
      });

      expect(result.isError).toBe(true);
    });

    it('should get a purchase order', async () => {
      mockQuickBooksInstance.getPurchaseOrder.mockImplementation((_id: any, cb: any) => cb(null, { Id: '1' }));

      const result = await getQuickbooksPurchaseOrder('1');

      expect(result.isError).toBe(false);
    });

    it('should get a purchase order - authentication error', async () => {
      (mockGetQuickbooks as any).mockRejectedValue(new Error('Auth failed'));

      const result = await getQuickbooksPurchaseOrder('1');

      expect(result.isError).toBe(true);
      expect(result.error).toContain('Auth failed');
    });

    it('should get a purchase order - API error', async () => {
      mockQuickBooksInstance.getPurchaseOrder.mockImplementation((_id: any, cb: any) =>
        cb(new Error('Not found'), null)
      );

      const result = await getQuickbooksPurchaseOrder('999');

      expect(result.isError).toBe(true);
    });

    it('should update a purchase order', async () => {
      mockQuickBooksInstance.updatePurchaseOrder.mockImplementation((payload: any, cb: any) => cb(null, {}));

      const result = await updateQuickbooksPurchaseOrder({ id: '1', sync_token: '0' });

      expect(result.isError).toBe(false);
    });

    it('should update a purchase order with all optional fields', async () => {
      mockQuickBooksInstance.updatePurchaseOrder.mockImplementation((payload: any, cb: any) => cb(null, {}));

      const result = await updateQuickbooksPurchaseOrder({
        id: '1',
        sync_token: '0',
        vendor_ref: 'vendor-2',
        private_note: 'Updated PO note',
        doc_number: 'PO-2024-001'
      });

      expect(result.isError).toBe(false);
    });

    it('should update a purchase order - authentication error', async () => {
      (mockGetQuickbooks as any).mockRejectedValue(new Error('Auth failed'));

      const result = await updateQuickbooksPurchaseOrder({ id: '1', sync_token: '0' });

      expect(result.isError).toBe(true);
      expect(result.error).toContain('Auth failed');
    });

    it('should update a purchase order - API error', async () => {
      mockQuickBooksInstance.updatePurchaseOrder.mockImplementation((payload: any, cb: any) =>
        cb(new Error('Update failed'), null)
      );

      const result = await updateQuickbooksPurchaseOrder({ id: '1', sync_token: '0' });

      expect(result.isError).toBe(true);
    });

    it('should delete a purchase order', async () => {
      mockQuickBooksInstance.deletePurchaseOrder.mockImplementation((payload: any, cb: any) => cb(null, {}));

      const result = await deleteQuickbooksPurchaseOrder({ id: '1', sync_token: '0' });

      expect(result.isError).toBe(false);
    });

    it('should delete a purchase order - authentication error', async () => {
      (mockGetQuickbooks as any).mockRejectedValue(new Error('Auth failed'));

      const result = await deleteQuickbooksPurchaseOrder({ id: '1', sync_token: '0' });

      expect(result.isError).toBe(true);
      expect(result.error).toContain('Auth failed');
    });

    it('should delete a purchase order - API error', async () => {
      mockQuickBooksInstance.deletePurchaseOrder.mockImplementation((payload: any, cb: any) =>
        cb(new Error('Delete failed'), null)
      );

      const result = await deleteQuickbooksPurchaseOrder({ id: '1', sync_token: '0' });

      expect(result.isError).toBe(true);
    });

    it('should search purchase orders', async () => {
      mockQuickBooksInstance.findPurchaseOrders.mockImplementation((criteria: any, cb: any) =>
        cb(null, { QueryResponse: { PurchaseOrder: [{ Id: '1' }] } })
      );

      const result = await searchQuickbooksPurchaseOrders({ vendor_ref: 'vendor-1' });

      expect(result.isError).toBe(false);
    });

    it('should search purchase orders - authentication error', async () => {
      (mockGetQuickbooks as any).mockRejectedValue(new Error('Auth failed'));

      const result = await searchQuickbooksPurchaseOrders({});

      expect(result.isError).toBe(true);
      expect(result.error).toContain('Auth failed');
    });

    it('should search purchase orders - API error', async () => {
      mockQuickBooksInstance.findPurchaseOrders.mockImplementation((criteria: any, cb: any) =>
        cb(new Error('Search failed'), null)
      );

      const result = await searchQuickbooksPurchaseOrders({});

      expect(result.isError).toBe(true);
    });

    it('should search purchase orders with all filter options', async () => {
      mockQuickBooksInstance.findPurchaseOrders.mockImplementation((criteria: any, cb: any) =>
        cb(null, { QueryResponse: { PurchaseOrder: [] } })
      );

      const result = await searchQuickbooksPurchaseOrders({
        vendor_ref: 'vendor-1',
        txn_date_from: '2024-01-01',
        txn_date_to: '2024-12-31',
        limit: 50
      });

      expect(result.isError).toBe(false);
    });

    it('should handle empty QueryResponse', async () => {
      mockQuickBooksInstance.findPurchaseOrders.mockImplementation((criteria: any, cb: any) =>
        cb(null, { QueryResponse: {} })
      );

      const result = await searchQuickbooksPurchaseOrders({ limit: 5 });

      expect(result.isError).toBe(false);
      expect(result.result).toEqual([]);
    });
  });

  describe('VendorCredit Handlers', () => {
    it('should create a vendor credit', async () => {
      mockQuickBooksInstance.createVendorCredit.mockImplementation((payload: any, cb: any) => cb(null, { Id: '1' }));

      const result = await createQuickbooksVendorCredit({
        vendor_ref: 'vendor-1',
        line_items: [{ amount: 75 }]
      });

      expect(result.isError).toBe(false);
    });

    it('should create a vendor credit with all optional fields', async () => {
      mockQuickBooksInstance.createVendorCredit.mockImplementation((payload: any, cb: any) => cb(null, { Id: '1' }));

      const result = await createQuickbooksVendorCredit({
        vendor_ref: 'vendor-1',
        line_items: [{ amount: 75, description: 'Vendor credit item', account_ref: 'acc-1' }],
        txn_date: '2024-01-15',
        doc_number: 'VC-001',
        private_note: 'Test vendor credit'
      });

      expect(result.isError).toBe(false);
    });

    it('should create a vendor credit - authentication error', async () => {
      (mockGetQuickbooks as any).mockRejectedValue(new Error('Auth failed'));

      const result = await createQuickbooksVendorCredit({
        vendor_ref: 'vendor-1',
        line_items: [{ amount: 75 }]
      });

      expect(result.isError).toBe(true);
      expect(result.error).toContain('Auth failed');
    });

    it('should create a vendor credit - API error', async () => {
      mockQuickBooksInstance.createVendorCredit.mockImplementation((payload: any, cb: any) =>
        cb(new Error('Create failed'), null)
      );

      const result = await createQuickbooksVendorCredit({
        vendor_ref: 'vendor-1',
        line_items: [{ amount: 75 }]
      });

      expect(result.isError).toBe(true);
    });

    it('should get a vendor credit', async () => {
      mockQuickBooksInstance.getVendorCredit.mockImplementation((_id: any, cb: any) => cb(null, { Id: '1' }));

      const result = await getQuickbooksVendorCredit('1');

      expect(result.isError).toBe(false);
    });

    it('should get a vendor credit - authentication error', async () => {
      (mockGetQuickbooks as any).mockRejectedValue(new Error('Auth failed'));

      const result = await getQuickbooksVendorCredit('1');

      expect(result.isError).toBe(true);
      expect(result.error).toContain('Auth failed');
    });

    it('should get a vendor credit - API error', async () => {
      mockQuickBooksInstance.getVendorCredit.mockImplementation((_id: any, cb: any) =>
        cb(new Error('Not found'), null)
      );

      const result = await getQuickbooksVendorCredit('999');

      expect(result.isError).toBe(true);
    });

    it('should update a vendor credit', async () => {
      mockQuickBooksInstance.updateVendorCredit.mockImplementation((payload: any, cb: any) => cb(null, {}));

      const result = await updateQuickbooksVendorCredit({ id: '1', sync_token: '0' });

      expect(result.isError).toBe(false);
    });

    it('should update a vendor credit with all optional fields', async () => {
      mockQuickBooksInstance.updateVendorCredit.mockImplementation((payload: any, cb: any) => cb(null, {}));

      const result = await updateQuickbooksVendorCredit({
        id: '1',
        sync_token: '0',
        vendor_ref: 'vendor-2',
        private_note: 'Updated vendor credit note'
      });

      expect(result.isError).toBe(false);
    });

    it('should update a vendor credit - authentication error', async () => {
      (mockGetQuickbooks as any).mockRejectedValue(new Error('Auth failed'));

      const result = await updateQuickbooksVendorCredit({ id: '1', sync_token: '0' });

      expect(result.isError).toBe(true);
      expect(result.error).toContain('Auth failed');
    });

    it('should update a vendor credit - API error', async () => {
      mockQuickBooksInstance.updateVendorCredit.mockImplementation((payload: any, cb: any) =>
        cb(new Error('Update failed'), null)
      );

      const result = await updateQuickbooksVendorCredit({ id: '1', sync_token: '0' });

      expect(result.isError).toBe(true);
    });

    it('should delete a vendor credit', async () => {
      mockQuickBooksInstance.deleteVendorCredit.mockImplementation((payload: any, cb: any) => cb(null, {}));

      const result = await deleteQuickbooksVendorCredit({ id: '1', sync_token: '0' });

      expect(result.isError).toBe(false);
    });

    it('should delete a vendor credit - authentication error', async () => {
      (mockGetQuickbooks as any).mockRejectedValue(new Error('Auth failed'));

      const result = await deleteQuickbooksVendorCredit({ id: '1', sync_token: '0' });

      expect(result.isError).toBe(true);
      expect(result.error).toContain('Auth failed');
    });

    it('should delete a vendor credit - API error', async () => {
      mockQuickBooksInstance.deleteVendorCredit.mockImplementation((payload: any, cb: any) =>
        cb(new Error('Delete failed'), null)
      );

      const result = await deleteQuickbooksVendorCredit({ id: '1', sync_token: '0' });

      expect(result.isError).toBe(true);
    });

    it('should search vendor credits', async () => {
      mockQuickBooksInstance.findVendorCredits.mockImplementation((criteria: any, cb: any) =>
        cb(null, { QueryResponse: { VendorCredit: [{ Id: '1' }] } })
      );

      const result = await searchQuickbooksVendorCredits({});

      expect(result.isError).toBe(false);
    });

    it('should search vendor credits - authentication error', async () => {
      (mockGetQuickbooks as any).mockRejectedValue(new Error('Auth failed'));

      const result = await searchQuickbooksVendorCredits({});

      expect(result.isError).toBe(true);
      expect(result.error).toContain('Auth failed');
    });

    it('should search vendor credits - API error', async () => {
      mockQuickBooksInstance.findVendorCredits.mockImplementation((criteria: any, cb: any) =>
        cb(new Error('Search failed'), null)
      );

      const result = await searchQuickbooksVendorCredits({});

      expect(result.isError).toBe(true);
    });

    it('should search vendor credits with all filter options', async () => {
      mockQuickBooksInstance.findVendorCredits.mockImplementation((criteria: any, cb: any) =>
        cb(null, { QueryResponse: { VendorCredit: [] } })
      );

      const result = await searchQuickbooksVendorCredits({
        vendor_ref: 'vendor-1',
        limit: 50
      });

      expect(result.isError).toBe(false);
    });

    it('should search vendor credits with only limit and handle empty result', async () => {
      mockQuickBooksInstance.findVendorCredits.mockImplementation((criteria: any, cb: any) =>
        cb(null, { QueryResponse: {} })
      );

      const result = await searchQuickbooksVendorCredits({ limit: 10 });

      expect(result.isError).toBe(false);
      expect(result.result).toEqual([]);
    });
  });
});
