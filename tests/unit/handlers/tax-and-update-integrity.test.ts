/**
 * Regression tests: tax-field forwarding on create tools and read-merge-write
 * update semantics. Grounded in production defects observed on a live
 * global-tax-model (CA) company: GlobalTaxCalculation silently dropped
 * (TaxInclusive posted as NotApplicable, computing tax on top instead of
 * extracting it), the "TaxExclusive" misspelling failing whole requests with
 * QBO's opaque parse fault, and sparse updates nulling omitted fields.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { mockQuickbooksClient, mockQuickbooksClientClass, mockQuickBooksInstance, resetAllMocks } from '../../mocks/quickbooks.mock';

jest.unstable_mockModule('../../../src/clients/quickbooks-client', () => ({
  quickbooksClient: mockQuickbooksClient,
  QuickbooksClient: mockQuickbooksClientClass,
}));

const { createQuickbooksPurchase } = await import('../../../src/handlers/create-quickbooks-purchase.handler');
const { createQuickbooksBill } = await import('../../../src/handlers/create-quickbooks-bill.handler');
const { updateQuickbooksPayment } = await import('../../../src/handlers/update-quickbooks-payment.handler');
const { updateQuickbooksPurchase } = await import('../../../src/handlers/update-quickbooks-purchase.handler');
const { normalizeGlobalTaxCalculation } = await import('../../../src/helpers/global-tax');
const { mergeForFullUpdate } = await import('../../../src/helpers/read-merge-write');
const { CreateBillTool } = await import('../../../src/tools/create-bill.tool');
const { UpdatePaymentTool } = await import('../../../src/tools/update-payment.tool');

const capture = (mock: any) => (mock.mock.calls[0] as any)[0];

describe('Tax forwarding and update integrity', () => {
  beforeEach(() => {
    resetAllMocks();
  });

  describe('GlobalTaxCalculation forwarding (create_purchase / create-bill)', () => {
    it('forwards GlobalTaxCalculation verbatim on create_purchase', async () => {
      mockQuickBooksInstance.createPurchase.mockImplementation((p: any, cb: any) => cb(null, { Id: '1' }));
      await createQuickbooksPurchase({
        PaymentType: 'Cash',
        Line: [{ Amount: 100, DetailType: 'AccountBasedExpenseLineDetail', AccountBasedExpenseLineDetail: { AccountRef: { value: '1' }, TaxCodeRef: { value: '7' } } }],
        GlobalTaxCalculation: 'TaxInclusive',
      });
      expect(capture(mockQuickBooksInstance.createPurchase).GlobalTaxCalculation).toBe('TaxInclusive');
    });

    it('forwards GlobalTaxCalculation on create-bill', async () => {
      mockQuickBooksInstance.createBill.mockImplementation((p: any, cb: any) => cb(null, { Id: '1' }));
      await createQuickbooksBill({ VendorRef: { value: '41' }, Line: [], GlobalTaxCalculation: 'TaxInclusive' });
      expect(capture(mockQuickBooksInstance.createBill).GlobalTaxCalculation).toBe('TaxInclusive');
    });

    it('(schema) create-bill declares GlobalTaxCalculation explicitly so schema validation cannot strip it', () => {
      const parsed = (CreateBillTool.schema as any).parse({
        bill: { VendorRef: { value: '41' }, Line: [], GlobalTaxCalculation: 'TaxInclusive' },
      });
      expect(parsed.bill.GlobalTaxCalculation).toBe('TaxInclusive');
    });
  });

  describe('"TaxExclusive" normalization (QBO parse-fault prevention)', () => {
    it('maps the TaxExclusive misspelling to TaxExcluded before the request leaves the server', async () => {
      mockQuickBooksInstance.createPurchase.mockImplementation((p: any, cb: any) => cb(null, { Id: '1' }));
      await createQuickbooksPurchase({ Line: [], GlobalTaxCalculation: 'TaxExclusive' });
      expect(capture(mockQuickBooksInstance.createPurchase).GlobalTaxCalculation).toBe('TaxExcluded');
    });

    it('rejects an unknown value with an actionable message instead of forwarding it to QBO', async () => {
      const result = await createQuickbooksPurchase({ Line: [], GlobalTaxCalculation: 'Bogus' });
      expect(result.isError).toBe(true);
      expect(result.error).toMatch(/Valid values: TaxExcluded, TaxInclusive, NotApplicable/);
      expect(mockQuickBooksInstance.createPurchase).not.toHaveBeenCalled();
    });

    it('accepts all three real enum values unchanged', () => {
      expect(normalizeGlobalTaxCalculation('TaxExcluded')).toBe('TaxExcluded');
      expect(normalizeGlobalTaxCalculation('TaxInclusive')).toBe('TaxInclusive');
      expect(normalizeGlobalTaxCalculation('NotApplicable')).toBe('NotApplicable');
    });
  });

  describe('item-based create-bill lines carry tax and class', () => {
    it('(schema) ItemBasedExpenseLineDetail keeps TaxCodeRef and ClassRef', () => {
      const parsed = (CreateBillTool.schema as any).parse({
        bill: {
          VendorRef: { value: '41' },
          Line: [{ Amount: 50, DetailType: 'ItemBasedExpenseLineDetail', ItemBasedExpenseLineDetail: { ItemRef: { value: 'i1' }, Qty: 2, TaxCodeRef: { value: '7' }, ClassRef: { value: 'c9' } } }],
        },
      });
      const detail = parsed.bill.Line[0].ItemBasedExpenseLineDetail;
      expect(detail.TaxCodeRef).toEqual({ value: '7' });
      expect(detail.ClassRef).toEqual({ value: 'c9' });
    });
  });

  describe('explicit TxnTaxDetail overrides on create-bill', () => {
    it('forwards a PercentBased:false TaxLine override for exact per-document tax', async () => {
      mockQuickBooksInstance.createBill.mockImplementation((p: any, cb: any) => cb(null, { Id: '1' }));
      const override = { TotalTax: 7.42, TaxLine: [{ Amount: 7.42, DetailType: 'TaxLineDetail', TaxLineDetail: { TaxRateRef: { value: '14' }, PercentBased: false } }] };
      await createQuickbooksBill({ VendorRef: { value: '41' }, Line: [], TxnTaxDetail: override });
      expect(capture(mockQuickBooksInstance.createBill).TxnTaxDetail).toEqual(override);
    });
  });

  describe('update_payment can apply a payment to a transaction (Payment.Line)', () => {
    it('maps line/linked_txn to Payment.Line[].LinkedTxn like create_payment does', async () => {
      mockQuickBooksInstance.getPayment.mockImplementation((_id: any, cb: any) =>
        cb(null, { Id: '9', SyncToken: '0', CustomerRef: { value: '3' }, TotalAmt: 500, UnappliedAmt: 500 })
      );
      mockQuickBooksInstance.updatePayment.mockImplementation((p: any, cb: any) => cb(null, {}));

      await updateQuickbooksPayment({
        id: '9',
        sync_token: '0',
        line: [{ amount: 500, linked_txn: [{ txn_id: '77', txn_type: 'Invoice' }] }],
      });

      const sent = capture(mockQuickBooksInstance.updatePayment);
      expect(sent.Line).toEqual([
        { Amount: 500, LinkedTxn: [{ TxnId: '77', TxnType: 'Invoice' }] },
      ]);
      expect(sent.sparse).toBe(false);
    });

    it('REPLACES existing applications when line is supplied (documented QBO semantics)', async () => {
      mockQuickBooksInstance.getPayment.mockImplementation((_id: any, cb: any) =>
        cb(null, {
          Id: '9',
          SyncToken: '0',
          TotalAmt: 500,
          Line: [{ Amount: 200, LinkedTxn: [{ TxnId: '11', TxnType: 'Invoice' }] }],
        })
      );
      mockQuickBooksInstance.updatePayment.mockImplementation((p: any, cb: any) => cb(null, {}));

      await updateQuickbooksPayment({
        id: '9',
        sync_token: '0',
        line: [{ amount: 500, linked_txn: [{ txn_id: '77', txn_type: 'Invoice' }] }],
      });

      const sent = capture(mockQuickBooksInstance.updatePayment);
      expect(sent.Line).toHaveLength(1);
      expect(sent.Line[0].LinkedTxn[0].TxnId).toBe('77'); // caller's set wins wholesale
    });

    it('leaves existing applications untouched when line is omitted', async () => {
      const existing = [{ Amount: 200, LinkedTxn: [{ TxnId: '11', TxnType: 'Invoice' }] }];
      mockQuickBooksInstance.getPayment.mockImplementation((_id: any, cb: any) =>
        cb(null, { Id: '9', SyncToken: '0', TotalAmt: 500, Line: existing })
      );
      mockQuickBooksInstance.updatePayment.mockImplementation((p: any, cb: any) => cb(null, {}));

      await updateQuickbooksPayment({ id: '9', sync_token: '0', private_note: 'note only' });

      expect(capture(mockQuickBooksInstance.updatePayment).Line).toEqual(existing);
    });

    it('preserves TotalAmt so applying lines cannot silently rewrite the payment amount', async () => {
      mockQuickBooksInstance.getPayment.mockImplementation((_id: any, cb: any) =>
        cb(null, { Id: '9', SyncToken: '0', TotalAmt: 500, UnappliedAmt: 500 })
      );
      mockQuickBooksInstance.updatePayment.mockImplementation((p: any, cb: any) => cb(null, {}));

      await updateQuickbooksPayment({
        id: '9',
        sync_token: '0',
        line: [{ amount: 300, linked_txn: [{ txn_id: '77', txn_type: 'Invoice' }] }],
      });

      // Without this, TotalAmt is stripped as a "derived" field and QBO would
      // re-derive 300 from the line — turning a $500 payment into a $300 one.
      expect(capture(mockQuickBooksInstance.updatePayment).TotalAmt).toBe(500);
    });

    it('still lets an explicit total_amt override the stored value', async () => {
      mockQuickBooksInstance.getPayment.mockImplementation((_id: any, cb: any) =>
        cb(null, { Id: '9', SyncToken: '0', TotalAmt: 500 })
      );
      mockQuickBooksInstance.updatePayment.mockImplementation((p: any, cb: any) => cb(null, {}));

      await updateQuickbooksPayment({ id: '9', sync_token: '0', total_amt: 750 });

      expect(capture(mockQuickBooksInstance.updatePayment).TotalAmt).toBe(750);
    });

    it('(schema) update_payment declares line so validation cannot strip it', () => {
      const parsed = (UpdatePaymentTool.schema as any).parse({
        id: '9',
        sync_token: '0',
        line: [{ amount: 500, linked_txn: [{ txn_id: '77', txn_type: 'Invoice' }] }],
      });
      expect(parsed.line[0].linked_txn[0].txn_id).toBe('77');
    });
  });

  describe('update_payment forwards DepositToAccountRef', () => {
    it('sends Payment.DepositToAccountRef (previously accepted but silently dropped)', async () => {
      mockQuickBooksInstance.updatePayment.mockImplementation((p: any, cb: any) => cb(null, {}));
      await updateQuickbooksPayment({ id: '5', sync_token: '0', deposit_to_account_ref: '89' });
      expect(capture(mockQuickBooksInstance.updatePayment).DepositToAccountRef).toEqual({ value: '89' });
    });
  });

  describe('read-merge-write update semantics', () => {
    it('update_purchase preserves omitted fields from the fetched entity instead of nulling them', async () => {
      mockQuickBooksInstance.getPurchase.mockImplementation((_id: any, cb: any) =>
        cb(null, { Id: '77', SyncToken: '4', PaymentType: 'Cash', AccountRef: { value: '35' }, TxnDate: '2026-07-01', TotalAmt: 113, TxnTaxDetail: { TotalTax: 13 }, MetaData: {} })
      );
      mockQuickBooksInstance.updatePurchase.mockImplementation((p: any, cb: any) => cb(null, {}));

      await updateQuickbooksPurchase({ Id: '77', SyncToken: '4', PrivateNote: 'note only' });

      const sent = capture(mockQuickBooksInstance.updatePurchase);
      expect(sent.PaymentType).toBe('Cash');
      expect(sent.AccountRef).toEqual({ value: '35' });
      expect(sent.TxnDate).toBe('2026-07-01');
      expect(sent.PrivateNote).toBe('note only');
      expect(sent.sparse).toBe(false);
      expect(sent.TotalAmt).toBeUndefined(); // derived — stripped so QBO recomputes
      expect(sent.MetaData).toBeUndefined(); // read-only — stripped
      expect(sent.TxnTaxDetail).toBeUndefined(); // recomputed from line tax codes
    });

    it('update_purchase normalizes GlobalTaxCalculation like create does', async () => {
      mockQuickBooksInstance.getPurchase.mockImplementation((_id: any, cb: any) => cb(null, { Id: '77', SyncToken: '4' }));
      mockQuickBooksInstance.updatePurchase.mockImplementation((p: any, cb: any) => cb(null, {}));
      await updateQuickbooksPurchase({ Id: '77', SyncToken: '4', GlobalTaxCalculation: 'TaxExclusive' });
      expect(capture(mockQuickBooksInstance.updatePurchase).GlobalTaxCalculation).toBe('TaxExcluded');
    });

    it('mergeForFullUpdate keeps the caller SyncToken over the fetched copy', async () => {
      const getFn = async () => ({ Id: '1', SyncToken: '9', Keep: 'yes' });
      const merged = await mergeForFullUpdate(getFn, { Id: '1', SyncToken: '3' });
      expect(merged.SyncToken).toBe('3');
      expect(merged.Keep).toBe('yes');
    });
  });
});
