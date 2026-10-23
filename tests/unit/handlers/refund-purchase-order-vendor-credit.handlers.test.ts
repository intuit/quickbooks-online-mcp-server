import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { mockQuickbooksClient, mockQuickbooksClientClass, mockQuickBooksInstance, resetAllMocks } from '../../mocks/quickbooks.mock';

// ESM-compatible module mocking
jest.unstable_mockModule('../../../src/clients/quickbooks-client', () => ({
  quickbooksClient: mockQuickbooksClient,
  QuickbooksClient: mockQuickbooksClientClass,
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
      const payload = (mockQuickBooksInstance.createRefundReceipt.mock.calls[0] as any)[0];
      expect(payload).not.toHaveProperty('GlobalTaxCalculation');
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

    it('should pass per-line TaxCodeRef and GlobalTaxCalculation to QuickBooks', async () => {
      mockQuickBooksInstance.createRefundReceipt.mockImplementation((payload: any, cb: any) => cb(null, { Id: '1' }));

      const result = await createQuickbooksRefundReceipt({
        customer_ref: 'cust-1',
        line_items: [
          { item_ref: 'item-1', qty: 2, unit_price: 50, tax_code_ref: '14' },
          { item_ref: 'item-2', qty: 1, unit_price: 75 }
        ],
        global_tax_calculation: 'TaxExcluded'
      });

      expect(result.isError).toBe(false);
      const payload = (mockQuickBooksInstance.createRefundReceipt.mock.calls[0] as any)[0];
      expect(payload.Line[0].SalesItemLineDetail.TaxCodeRef).toEqual({ value: '14' });
      expect(payload.Line[1].SalesItemLineDetail.TaxCodeRef).toBeUndefined();
      expect(payload.GlobalTaxCalculation).toBe('TaxExcluded');
    });

    it('should reject a non-numeric class_ref before calling QuickBooks', async () => {
      const result = await createQuickbooksRefundReceipt({
        customer_ref: 'cust-1',
        line_items: [{ item_ref: 'item-1', qty: 1, unit_price: 1, class_ref: 'Restoration' }],
      });

      expect(result.isError).toBe(true);
      expect(mockQuickBooksInstance.createRefundReceipt).not.toHaveBeenCalled();
    });

    it('should pass per-line ClassRef to QuickBooks when class_ref is given', async () => {
      mockQuickBooksInstance.createRefundReceipt.mockImplementation((payload: any, cb: any) =>
        cb(null, {
          Id: '1',
          Line: [
            {
              DetailType: 'SalesItemLineDetail',
              SalesItemLineDetail: { ClassRef: { value: '682828' } },
            },
            { DetailType: 'SalesItemLineDetail', SalesItemLineDetail: {} },
          ],
        })
      );

      await createQuickbooksRefundReceipt({
        customer_ref: 'cust-1',
        line_items: [
          { item_ref: 'item-1', qty: 1, unit_price: 100, class_ref: '682828' },
          { item_ref: 'item-2', qty: 1, unit_price: 50 },
        ],
      });

      const payload = (mockQuickBooksInstance.createRefundReceipt.mock.calls[0] as any)[0];
      expect(payload.Line[0].SalesItemLineDetail.ClassRef).toEqual({ value: '682828' });
      expect(payload.Line[1].SalesItemLineDetail.ClassRef).toBeUndefined();
    });

    it('should create a refund receipt - authentication error', async () => {
      (mockQuickbooksClientClass.getInstance as any).mockRejectedValue(new Error('Auth failed'));

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
      (mockQuickbooksClientClass.getInstance as any).mockRejectedValue(new Error('Auth failed'));

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
      (mockQuickbooksClientClass.getInstance as any).mockRejectedValue(new Error('Auth failed'));

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
      (mockQuickbooksClientClass.getInstance as any).mockRejectedValue(new Error('Auth failed'));

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
      (mockQuickbooksClientClass.getInstance as any).mockRejectedValue(new Error('Auth failed'));

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
      (mockQuickbooksClientClass.getInstance as any).mockRejectedValue(new Error('Auth failed'));

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
      (mockQuickbooksClientClass.getInstance as any).mockRejectedValue(new Error('Auth failed'));

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
      (mockQuickbooksClientClass.getInstance as any).mockRejectedValue(new Error('Auth failed'));

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
      (mockQuickbooksClientClass.getInstance as any).mockRejectedValue(new Error('Auth failed'));

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
      (mockQuickbooksClientClass.getInstance as any).mockRejectedValue(new Error('Auth failed'));

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

    it('should map per-line tax code, class, billable status and global tax calculation like bills do', async () => {
      // Modeled on the HST ON verification case: 6698.22 @ 13% -> QBO
      // computes TotalTax 870.77 / TotalAmt 7568.99 from the line tax code.
      let captured: any;
      mockQuickBooksInstance.createVendorCredit.mockImplementation((payload: any, cb: any) => {
        captured = payload;
        cb(null, {
          Id: '42',
          TotalAmt: 7568.99,
          GlobalTaxCalculation: 'TaxExcluded',
          TxnTaxDetail: { TotalTax: 870.77 },
          Line: payload.Line,
        });
      });

      const result = await createQuickbooksVendorCredit({
        vendor_ref: 'vendor-1',
        line_items: [
          {
            amount: 6698.22,
            description: 'Accrued liability reversal',
            account_ref: 'acc-accrued-liabilities',
            class_ref: 'class-7',
            tax_code_ref: 'H',
            billable_status: 'NotBillable',
            customer_ref: 'cust-3',
          },
        ],
        global_tax_calculation: 'TaxExcluded',
      });

      expect(result.isError).toBe(false);
      const detail = captured.Line[0].AccountBasedExpenseLineDetail;
      expect(detail.AccountRef).toEqual({ value: 'acc-accrued-liabilities' });
      expect(detail.ClassRef).toEqual({ value: 'class-7' });
      expect(detail.TaxCodeRef).toEqual({ value: 'H' });
      expect(detail.BillableStatus).toBe('NotBillable');
      expect(detail.CustomerRef).toEqual({ value: 'cust-3' });
      expect(captured.GlobalTaxCalculation).toBe('TaxExcluded');
      // TxnTaxDetail is left to QBO's tax engine — never hardcoded by us.
      expect(captured.TxnTaxDetail).toBeUndefined();
      // Read-back assertions per the verification case.
      expect(result.result.TxnTaxDetail.TotalTax).toBeGreaterThan(0);
      expect(result.result.TxnTaxDetail.TotalTax).toBe(870.77);
      expect(result.result.TotalAmt).toBe(7568.99);
      expect(result.result.GlobalTaxCalculation).toBe('TaxExcluded');
      expect(result.result.Line[0].AccountBasedExpenseLineDetail.ClassRef).toEqual({ value: 'class-7' });
    });

    it('should keep legacy simple line items working (no tax/class fields)', async () => {
      let captured: any;
      mockQuickBooksInstance.createVendorCredit.mockImplementation((payload: any, cb: any) => {
        captured = payload;
        cb(null, { Id: '1' });
      });

      const result = await createQuickbooksVendorCredit({
        vendor_ref: 'vendor-1',
        line_items: [{ amount: 75, description: 'plain', account_ref: 'acc-1' }],
      });

      expect(result.isError).toBe(false);
      expect(captured.Line[0].AccountBasedExpenseLineDetail).toEqual({ AccountRef: { value: 'acc-1' } });
      expect(captured.GlobalTaxCalculation).toBeUndefined();
    });

    it('should create a vendor credit - authentication error', async () => {
      (mockQuickbooksClientClass.getInstance as any).mockRejectedValue(new Error('Auth failed'));

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
      (mockQuickbooksClientClass.getInstance as any).mockRejectedValue(new Error('Auth failed'));

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

    it('should replace lines via full update, preserving unrelated fields and SyncToken', async () => {
      // QBO rejects sparse updates that replace lines (error 2020: VendorRef
      // missing) — the handler must read-modify-write the full entity.
      mockQuickBooksInstance.getVendorCredit.mockImplementation((_id: any, cb: any) =>
        cb(null, {
          Id: '42',
          SyncToken: '2',
          VendorRef: { value: 'vendor-9', name: 'Original Vendor' },
          DocNumber: 'VC-9',
          TxnDate: '2026-07-01',
          GlobalTaxCalculation: 'TaxInclusive',
          TxnTaxDetail: { TotalTax: 1.23 },
          TotalAmt: 11.23,
          Balance: 11.23,
          MetaData: { CreateTime: 'x' },
          Line: [{ Id: '1', Amount: 10, DetailType: 'AccountBasedExpenseLineDetail' }],
        })
      );
      let captured: any;
      mockQuickBooksInstance.updateVendorCredit.mockImplementation((payload: any, cb: any) => {
        captured = payload;
        cb(null, { Id: '42', SyncToken: '3' });
      });

      const result = await updateQuickbooksVendorCredit({
        id: '42',
        sync_token: '2',
        line_items: [
          { amount: 6698.22, account_ref: 'acc-accrued-liabilities', tax_code_ref: 'H', class_ref: 'class-7' },
          { amount: 100, account_ref: 'acc-2' },
        ],
        global_tax_calculation: 'TaxExcluded',
      });

      expect(result.isError).toBe(false);
      expect(captured.Id).toBe('42');
      expect(captured.SyncToken).toBe('2'); // caller's token, not the fetched copy's
      expect(captured.sparse).toBe(false); // full update
      expect(captured.VendorRef).toEqual({ value: 'vendor-9', name: 'Original Vendor' }); // preserved
      expect(captured.DocNumber).toBe('VC-9'); // preserved
      expect(captured.TxnDate).toBe('2026-07-01'); // preserved
      expect(captured.TxnTaxDetail).toBeUndefined(); // recomputed by QBO
      expect(captured.TotalAmt).toBeUndefined(); // derived — stripped
      expect(captured.MetaData).toBeUndefined(); // read-only — stripped
      expect(captured.Line).toHaveLength(2);
      expect(captured.Line[0].AccountBasedExpenseLineDetail.TaxCodeRef).toEqual({ value: 'H' });
      expect(captured.Line[0].AccountBasedExpenseLineDetail.ClassRef).toEqual({ value: 'class-7' });
      expect(captured.Line[1].AccountBasedExpenseLineDetail).toEqual({ AccountRef: { value: 'acc-2' } });
      expect(captured.GlobalTaxCalculation).toBe('TaxExcluded'); // override wins over fetched TaxInclusive
    });

    it('should let vendor_ref override the fetched vendor on line replacement', async () => {
      mockQuickBooksInstance.getVendorCredit.mockImplementation((_id: any, cb: any) =>
        cb(null, { Id: '42', SyncToken: '2', VendorRef: { value: 'vendor-9' }, Line: [] })
      );
      let captured: any;
      mockQuickBooksInstance.updateVendorCredit.mockImplementation((payload: any, cb: any) => {
        captured = payload;
        cb(null, {});
      });

      const result = await updateQuickbooksVendorCredit({
        id: '42',
        sync_token: '2',
        vendor_ref: 'vendor-10',
        private_note: 'swapped vendor',
        line_items: [{ amount: 5, account_ref: 'acc-1' }],
      });

      expect(result.isError).toBe(false);
      expect(captured.VendorRef).toEqual({ value: 'vendor-10' });
      expect(captured.PrivateNote).toBe('swapped vendor');
    });

    it('should surface a read failure during line replacement', async () => {
      mockQuickBooksInstance.getVendorCredit.mockImplementation((_id: any, cb: any) =>
        cb(new Error('Not found'), null)
      );

      const result = await updateQuickbooksVendorCredit({
        id: '404',
        sync_token: '0',
        line_items: [{ amount: 5, account_ref: 'acc-1' }],
      });

      expect(result.isError).toBe(true);
      expect(result.error).toContain('Not found');
    });

    it('should not touch Line when line_items is omitted on update', async () => {
      let captured: any;
      mockQuickBooksInstance.updateVendorCredit.mockImplementation((payload: any, cb: any) => {
        captured = payload;
        cb(null, {});
      });

      const result = await updateQuickbooksVendorCredit({ id: '1', sync_token: '0', private_note: 'note only' });

      expect(result.isError).toBe(false);
      expect(captured.Line).toBeUndefined();
      expect(captured.GlobalTaxCalculation).toBeUndefined();
    });

    it('should update a vendor credit - authentication error', async () => {
      (mockQuickbooksClientClass.getInstance as any).mockRejectedValue(new Error('Auth failed'));

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
      (mockQuickbooksClientClass.getInstance as any).mockRejectedValue(new Error('Auth failed'));

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
      (mockQuickbooksClientClass.getInstance as any).mockRejectedValue(new Error('Auth failed'));

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


