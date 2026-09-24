import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { mockQuickbooksClient, mockQuickbooksClientClass, mockQuickBooksInstance, resetAllMocks } from '../../mocks/quickbooks.mock';

// ESM-compatible module mocking
jest.unstable_mockModule('../../../src/clients/quickbooks-client', () => ({
  quickbooksClient: mockQuickbooksClient,
  QuickbooksClient: mockQuickbooksClientClass,
}));

// Dynamic imports after mock setup
const { createQuickbooksBill } = await import('../../../src/handlers/create-quickbooks-bill.handler');
const { getQuickbooksBill } = await import('../../../src/handlers/get-quickbooks-bill.handler');
const { updateQuickbooksBill } = await import('../../../src/handlers/update-quickbooks-bill.handler');
const { deleteQuickbooksBill } = await import('../../../src/handlers/delete-quickbooks-bill.handler');
const { searchQuickbooksBills } = await import('../../../src/handlers/search-quickbooks-bills.handler');

describe('Bill Handlers', () => {
  beforeEach(() => {
    resetAllMocks();
  });

  describe('createQuickbooksBill', () => {
    it('should create a bill successfully', async () => {
      const mockBill = { Id: '1', TotalAmt: 500, Balance: 500 };
      mockQuickBooksInstance.createBill.mockImplementation((_payload: any, cb: any) => cb(null, mockBill));

      const result = await createQuickbooksBill({
        Line: [{ Amount: 500, DetailType: 'AccountBasedExpenseLineDetail', Description: 'Office supplies', AccountRef: { value: '1' } }],
        VendorRef: { value: '56' },
        DueDate: '2026-05-01',
        Balance: 500,
        TotalAmt: 500,
      });

      expect(result.isError).toBe(false);
      expect(result.result).toEqual(mockBill);
    });

    it('should preserve already-structured line items and pass through bare lines', async () => {
      const mockBill = { Id: '2', TotalAmt: 200 };
      mockQuickBooksInstance.createBill.mockImplementation((_payload: any, cb: any) => cb(null, mockBill));

      const result = await createQuickbooksBill({
        Line: [
          // already has AccountBasedExpenseLineDetail — must be returned as-is (line 18)
          { Amount: 100, AccountBasedExpenseLineDetail: { AccountRef: { value: '1' } } },
          // already has ItemBasedExpenseLineDetail — must be returned as-is (line 18)
          { Amount: 50, ItemBasedExpenseLineDetail: { ItemRef: { value: '2' } } },
          // no AccountRef and no detail key — bare pass-through (line 27)
          { Amount: 0, DetailType: 'SubTotalLineDetail' },
        ],
        VendorRef: { value: '56' },
      });

      expect(result.isError).toBe(false);
      expect(result.result).toEqual(mockBill);
    });

    it('should handle API errors', async () => {
      mockQuickBooksInstance.createBill.mockImplementation((_payload: any, cb: any) =>
        cb(new Error('SAXParseException: Premature end of file'), null)
      );

      const result = await createQuickbooksBill({});

      expect(result.isError).toBe(true);
    });

    it('should handle authentication errors', async () => {
      (mockQuickbooksClientClass.getInstance as any).mockRejectedValue(new Error('Auth failed'));

      const result = await createQuickbooksBill({});

      expect(result.isError).toBe(true);
      expect(result.error).toContain('Error: Auth failed');
    });
  });

  describe('getQuickbooksBill', () => {
    it('should get a bill by ID', async () => {
      const mockBill = { Id: '1', TotalAmt: 500, Balance: 500 };
      mockQuickBooksInstance.getBill.mockImplementation((_id: any, cb: any) => cb(null, mockBill));

      const result = await getQuickbooksBill('1');

      expect(result.isError).toBe(false);
      expect(result.result).toEqual(mockBill);
    });

    it('should handle API errors', async () => {
      mockQuickBooksInstance.getBill.mockImplementation((_id: any, cb: any) =>
        cb(new Error('Not found'), null)
      );

      const result = await getQuickbooksBill('999');

      expect(result.isError).toBe(true);
    });

    it('should handle authentication errors', async () => {
      (mockQuickbooksClientClass.getInstance as any).mockRejectedValue(new Error('Auth failed'));

      const result = await getQuickbooksBill('1');

      expect(result.isError).toBe(true);
      expect(result.error).toContain('Error: Auth failed');
    });
  });

  describe('updateQuickbooksBill', () => {
    // Default: company is NOT on Automated Sales Tax (PartnerTaxEnabled absent),
    // so a dropped line-level TaxCodeRef is treated as real data loss. AST-specific
    // tests override this per-case.
    beforeEach(() => {
      mockQuickBooksInstance.getPreferences.mockImplementation((cb: any) =>
        cb(null, { TaxPrefs: {} })
      );
    });

    // A bill whose principal line carries the class + tax tracking that prior
    // schemas silently stripped on update.
    const currentBill = {
      Id: '1',
      SyncToken: '5',
      VendorRef: { value: '56' },
      Line: [
        {
          Id: '1',
          Amount: 500,
          DetailType: 'AccountBasedExpenseLineDetail',
          AccountBasedExpenseLineDetail: {
            AccountRef: { value: '1' },
            ClassRef: { value: '100', name: '5614' },
            TaxCodeRef: { value: 'NON' },
          },
        },
      ],
    };

    it('should update a bill via read-merge-write', async () => {
      mockQuickBooksInstance.getBill.mockImplementation((_id: any, cb: any) => cb(null, currentBill));
      const updated = { ...currentBill, SyncToken: '6' };
      mockQuickBooksInstance.updateBill.mockImplementation((_payload: any, cb: any) => cb(null, updated));

      const result = await updateQuickbooksBill({ Id: '1', DueDate: '2026-05-10' });

      expect(result.isError).toBe(false);
      expect(result.result).toEqual(updated);
    });

    it('should preserve ClassRef/TaxCodeRef when the caller omits them', async () => {
      mockQuickBooksInstance.getBill.mockImplementation((_id: any, cb: any) => cb(null, currentBill));
      let sentPayload: any;
      mockQuickBooksInstance.updateBill.mockImplementation((payload: any, cb: any) => {
        sentPayload = payload;
        cb(null, payload); // QBO echoes back the saved object
      });

      // The bug repro: caller supplies a line WITHOUT ClassRef/TaxCodeRef.
      const result = await updateQuickbooksBill({
        Id: '1',
        Line: [
          {
            Id: '1',
            Amount: 600,
            DetailType: 'AccountBasedExpenseLineDetail',
            AccountBasedExpenseLineDetail: { AccountRef: { value: '1' } },
          },
        ],
      });

      expect(result.isError).toBe(false);
      // Class + tax survived the merge into the outbound payload...
      expect(sentPayload.Line[0].AccountBasedExpenseLineDetail.ClassRef).toEqual({ value: '100', name: '5614' });
      expect(sentPayload.Line[0].AccountBasedExpenseLineDetail.TaxCodeRef).toEqual({ value: 'NON' });
      // ...while the caller's amount change applied...
      expect(sentPayload.Line[0].Amount).toBe(600);
      // ...and the freshest SyncToken was used, not the caller's.
      expect(sentPayload.SyncToken).toBe('5');
    });

    it('should let the caller explicitly override an existing ClassRef', async () => {
      mockQuickBooksInstance.getBill.mockImplementation((_id: any, cb: any) => cb(null, currentBill));
      let sentPayload: any;
      mockQuickBooksInstance.updateBill.mockImplementation((payload: any, cb: any) => {
        sentPayload = payload;
        cb(null, payload);
      });

      await updateQuickbooksBill({
        Id: '1',
        Line: [
          {
            Id: '1',
            AccountBasedExpenseLineDetail: { ClassRef: { value: '200', name: '179' } },
          },
        ],
      });

      expect(sentPayload.Line[0].AccountBasedExpenseLineDetail.ClassRef).toEqual({ value: '200', name: '179' });
      // AccountRef from current is still preserved through the override.
      expect(sentPayload.Line[0].AccountBasedExpenseLineDetail.AccountRef).toEqual({ value: '1' });
    });

    it('should error if QuickBooks drops a ClassRef on the round-trip', async () => {
      mockQuickBooksInstance.getBill.mockImplementation((_id: any, cb: any) => cb(null, currentBill));
      const strippedBack = {
        ...currentBill,
        SyncToken: '6',
        Line: [
          {
            Id: '1',
            Amount: 500,
            DetailType: 'AccountBasedExpenseLineDetail',
            AccountBasedExpenseLineDetail: { AccountRef: { value: '1' }, TaxCodeRef: { value: 'NON' } },
          },
        ],
      };
      mockQuickBooksInstance.updateBill.mockImplementation((_payload: any, cb: any) => cb(null, strippedBack));

      const result = await updateQuickbooksBill({ Id: '1', DueDate: '2026-05-10' });

      expect(result.isError).toBe(true);
      expect(result.error).toContain('ClassRef');
    });

    it('should add a new line (no Id) without disturbing existing classed lines', async () => {
      mockQuickBooksInstance.getBill.mockImplementation((_id: any, cb: any) => cb(null, currentBill));
      let sentPayload: any;
      mockQuickBooksInstance.updateBill.mockImplementation((payload: any, cb: any) => {
        sentPayload = payload;
        cb(null, payload);
      });

      await updateQuickbooksBill({
        Id: '1',
        Line: [
          // existing classed line, re-supplied by Id
          { Id: '1', AccountBasedExpenseLineDetail: { AccountRef: { value: '1' } } },
          // brand-new interest line (no Id) — passes through as authored
          {
            Amount: 112.04,
            DetailType: 'AccountBasedExpenseLineDetail',
            Description: 'interest',
            AccountBasedExpenseLineDetail: { AccountRef: { value: '184' }, ClassRef: { value: '100', name: '5614' } },
          },
        ],
      });

      // existing line kept its class via merge
      expect(sentPayload.Line[0].AccountBasedExpenseLineDetail.ClassRef).toEqual({ value: '100', name: '5614' });
      // new line preserved exactly as authored
      expect(sentPayload.Line[1].Amount).toBe(112.04);
      expect(sentPayload.Line[1].AccountBasedExpenseLineDetail.ClassRef).toEqual({ value: '100', name: '5614' });
    });

    it('should perform a header-only update without touching the line array', async () => {
      mockQuickBooksInstance.getBill.mockImplementation((_id: any, cb: any) => cb(null, currentBill));
      let sentPayload: any;
      mockQuickBooksInstance.updateBill.mockImplementation((payload: any, cb: any) => {
        sentPayload = payload;
        cb(null, payload);
      });

      const result = await updateQuickbooksBill({ Id: '1', PrivateNote: 'paid 2026-06-24' });

      expect(result.isError).toBe(false);
      expect(sentPayload.PrivateNote).toBe('paid 2026-06-24');
      // lines carried over verbatim, class intact
      expect(sentPayload.Line).toEqual(currentBill.Line);
    });

    it('should not flag a line the caller intentionally removed', async () => {
      const twoLine = {
        ...currentBill,
        Line: [
          currentBill.Line[0],
          { Id: '2', Amount: 50, DetailType: 'AccountBasedExpenseLineDetail', AccountBasedExpenseLineDetail: { AccountRef: { value: '9' }, ClassRef: { value: '100' } } },
        ],
      };
      mockQuickBooksInstance.getBill.mockImplementation((_id: any, cb: any) => cb(null, twoLine));
      // caller resubmits only line 1; QBO returns a bill with line 2 gone
      mockQuickBooksInstance.updateBill.mockImplementation((payload: any, cb: any) => cb(null, payload));

      const result = await updateQuickbooksBill({
        Id: '1',
        Line: [{ Id: '1', AccountBasedExpenseLineDetail: { AccountRef: { value: '1' } } }],
      });

      expect(result.isError).toBe(false); // dropping line 2 was intentional, not a regression
    });

    it('should error if the whole line detail is dropped on the round-trip', async () => {
      mockQuickBooksInstance.getBill.mockImplementation((_id: any, cb: any) => cb(null, currentBill));
      // updated line lost its entire AccountBasedExpenseLineDetail
      const wiped = { ...currentBill, Line: [{ Id: '1', Amount: 500, DetailType: 'AccountBasedExpenseLineDetail' }] };
      mockQuickBooksInstance.updateBill.mockImplementation((_payload: any, cb: any) => cb(null, wiped));

      const result = await updateQuickbooksBill({ Id: '1', PrivateNote: 'x' });

      expect(result.isError).toBe(true);
      expect(result.error).toContain('ClassRef');
      expect(result.error).toContain('TaxCodeRef');
    });

    it('should require bill.Id', async () => {
      const missingId = await updateQuickbooksBill({ DueDate: '2026-05-10' });
      expect(missingId.isError).toBe(true);
      expect(missingId.error).toContain('Id');

      const noBill = await updateQuickbooksBill(undefined as any);
      expect(noBill.isError).toBe(true);
      expect(noBill.error).toContain('Id');
    });

    it('should surface an error if the initial read fails', async () => {
      mockQuickBooksInstance.getBill.mockImplementation((_id: any, cb: any) =>
        cb(new Error('Bill 1 not found'), null)
      );

      const result = await updateQuickbooksBill({ Id: '1', PrivateNote: 'x' });

      expect(result.isError).toBe(true);
      expect(result.error).toContain('not found');
    });

    it('should handle API errors', async () => {
      mockQuickBooksInstance.getBill.mockImplementation((_id: any, cb: any) => cb(null, currentBill));
      mockQuickBooksInstance.updateBill.mockImplementation((_payload: any, cb: any) =>
        cb(new Error('Update failed'), null)
      );

      const result = await updateQuickbooksBill({ Id: '1' });

      expect(result.isError).toBe(true);
    });

    it('should handle authentication errors', async () => {
      (mockQuickbooksClientClass.getInstance as any).mockRejectedValue(new Error('Auth failed'));

      const result = await updateQuickbooksBill({ Id: '1' });

      expect(result.isError).toBe(true);
      expect(result.error).toContain('Error: Auth failed');
    });

    // ── Automated Sales Tax (AST) handling ────────────────────────────────────
    // Under AST, QBO manages tax centrally and legitimately removes line-level
    // TaxCodeRef. A dropped TaxCodeRef must be a non-blocking warning, not an error.
    // A line whose TaxCodeRef QBO strips on the round-trip (no ClassRef involved).
    const taxOnlyBill = {
      Id: '1',
      SyncToken: '5',
      VendorRef: { value: '56' },
      Line: [
        {
          Id: '1',
          Amount: 500,
          DetailType: 'AccountBasedExpenseLineDetail',
          AccountBasedExpenseLineDetail: { AccountRef: { value: '1' }, TaxCodeRef: { value: 'NON' } },
        },
      ],
    };
    const taxStrippedBack = {
      ...taxOnlyBill,
      SyncToken: '6',
      Line: [
        {
          Id: '1',
          Amount: 500,
          DetailType: 'AccountBasedExpenseLineDetail',
          AccountBasedExpenseLineDetail: { AccountRef: { value: '1' } }, // TaxCodeRef gone
        },
      ],
    };

    it('warns (does not error) when AST is on and QBO drops a TaxCodeRef', async () => {
      mockQuickBooksInstance.getPreferences.mockImplementation((cb: any) =>
        cb(null, { TaxPrefs: { PartnerTaxEnabled: true } })
      );
      mockQuickBooksInstance.getBill.mockImplementation((_id: any, cb: any) => cb(null, taxOnlyBill));
      mockQuickBooksInstance.updateBill.mockImplementation((_payload: any, cb: any) => cb(null, taxStrippedBack));

      const result = await updateQuickbooksBill({ Id: '1', PrivateNote: 'x' });

      expect(result.isError).toBe(false);
      expect((result.result as any)._warning).toContain('Automated Sales Tax');
      expect((result.result as any)._warning).toContain('Line 1');
    });

    it('treats PartnerTaxEnabled:false as AST-enabled (attribute present)', async () => {
      mockQuickBooksInstance.getPreferences.mockImplementation((cb: any) =>
        cb(null, { TaxPrefs: { PartnerTaxEnabled: false } })
      );
      mockQuickBooksInstance.getBill.mockImplementation((_id: any, cb: any) => cb(null, taxOnlyBill));
      mockQuickBooksInstance.updateBill.mockImplementation((_payload: any, cb: any) => cb(null, taxStrippedBack));

      const result = await updateQuickbooksBill({ Id: '1', PrivateNote: 'x' });

      expect(result.isError).toBe(false);
      expect((result.result as any)._warning).toContain('Automated Sales Tax');
    });

    it('still errors on a dropped ClassRef even when AST is on', async () => {
      mockQuickBooksInstance.getPreferences.mockImplementation((cb: any) =>
        cb(null, { TaxPrefs: { PartnerTaxEnabled: true } })
      );
      mockQuickBooksInstance.getBill.mockImplementation((_id: any, cb: any) => cb(null, currentBill));
      // ClassRef dropped, TaxCodeRef also dropped — only ClassRef should error under AST.
      const wiped = { ...currentBill, Line: [{ Id: '1', Amount: 500, DetailType: 'AccountBasedExpenseLineDetail', AccountBasedExpenseLineDetail: { AccountRef: { value: '1' } } }] };
      mockQuickBooksInstance.updateBill.mockImplementation((_payload: any, cb: any) => cb(null, wiped));

      const result = await updateQuickbooksBill({ Id: '1', PrivateNote: 'x' });

      expect(result.isError).toBe(true);
      expect(result.error).toContain('ClassRef');
      expect(result.error).not.toContain('TaxCodeRef'); // suppressed under AST
    });

    it('surfaces an error if reading Preferences fails', async () => {
      // Preferences is only read when a TaxCodeRef was actually dropped, so drive that path.
      mockQuickBooksInstance.getBill.mockImplementation((_id: any, cb: any) => cb(null, taxOnlyBill));
      mockQuickBooksInstance.updateBill.mockImplementation((_payload: any, cb: any) => cb(null, taxStrippedBack));
      mockQuickBooksInstance.getPreferences.mockImplementation((cb: any) =>
        cb(new Error('Preferences read failed'), null)
      );

      const result = await updateQuickbooksBill({ Id: '1', PrivateNote: 'x' });

      expect(result.isError).toBe(true);
      expect(result.error).toContain('Preferences read failed');
    });

    // ── Global-tax-model (CA) tax preservation ────────────────────────────────
    // A paid bill that reads back as GlobalTaxCalculation "NotApplicable" while
    // carrying 13% tax on one line. Echoing that on update stripped the tax.
    const taxedBill = {
      Id: '42',
      SyncToken: '2',
      VendorRef: { value: '7' },
      GlobalTaxCalculation: 'NotApplicable',
      TotalAmt: 1113,
      HomeTotalAmt: 1113,
      Balance: 0,
      HomeBalance: 0,
      Line: [
        { Id: '1', Amount: 1000, DetailType: 'AccountBasedExpenseLineDetail', AccountBasedExpenseLineDetail: { AccountRef: { value: '10' }, TaxCodeRef: { value: '3' } } },
        { Id: '2', Amount: 100, DetailType: 'AccountBasedExpenseLineDetail', AccountBasedExpenseLineDetail: { AccountRef: { value: '10' }, TaxCodeRef: { value: '6' } } },
      ],
      TxnTaxDetail: {
        TotalTax: 13,
        TaxLine: [{ Amount: 13, DetailType: 'TaxLineDetail', TaxLineDetail: { TaxRateRef: { value: '11' }, PercentBased: true, TaxPercent: 13, NetAmountTaxable: 100 } }],
      },
    };

    const captureUpdate = (echo?: (payload: any) => any) => {
      const sent: { payload?: any } = {};
      mockQuickBooksInstance.getBill.mockImplementation((_id: any, cb: any) => cb(null, taxedBill));
      mockQuickBooksInstance.updateBill.mockImplementation((payload: any, cb: any) => {
        sent.payload = payload;
        cb(null, echo ? echo(payload) : { ...taxedBill, ...payload, SyncToken: '3' });
      });
      return sent;
    };

    it('does not echo NotApplicable on a taxed bill — infers TaxExcluded from its amounts', async () => {
      const sent = captureUpdate();
      const result = await updateQuickbooksBill({ Id: '42', PrivateNote: 'x' });

      expect(result.isError).toBe(false);
      expect(sent.payload.GlobalTaxCalculation).toBe('TaxExcluded');
    });

    it('infers TaxInclusive when the line amounts already contain the tax', async () => {
      const inclusive = { ...taxedBill, TotalAmt: 1100 };
      const sent: any = {};
      mockQuickBooksInstance.getBill.mockImplementation((_id: any, cb: any) => cb(null, inclusive));
      mockQuickBooksInstance.updateBill.mockImplementation((payload: any, cb: any) => {
        sent.payload = payload;
        cb(null, { ...inclusive, ...payload });
      });

      await updateQuickbooksBill({ Id: '42', PrivateNote: 'x' });

      expect(sent.payload.GlobalTaxCalculation).toBe('TaxInclusive');
    });

    it('leaves NotApplicable alone when the bill has no tax or the mode cannot be inferred', async () => {
      const untaxed = { ...taxedBill, TxnTaxDetail: { TotalTax: 0 }, TotalAmt: 1100 };
      const sent: any = {};
      mockQuickBooksInstance.getBill.mockImplementation((_id: any, cb: any) => cb(null, untaxed));
      mockQuickBooksInstance.updateBill.mockImplementation((payload: any, cb: any) => {
        sent.payload = payload;
        cb(null, { ...untaxed, ...payload });
      });
      await updateQuickbooksBill({ Id: '42', PrivateNote: 'x' });
      expect(sent.payload.GlobalTaxCalculation).toBe('NotApplicable');

      const odd = { ...taxedBill, TotalAmt: 999 };
      mockQuickBooksInstance.getBill.mockImplementation((_id: any, cb: any) => cb(null, odd));
      mockQuickBooksInstance.updateBill.mockImplementation((payload: any, cb: any) => {
        sent.payload = payload;
        cb(null, { ...odd, ...payload });
      });
      await updateQuickbooksBill({ Id: '42', PrivateNote: 'x' });
      expect(sent.payload.GlobalTaxCalculation).toBe('NotApplicable');
    });

    it('respects (and normalizes) a caller-supplied GlobalTaxCalculation', async () => {
      const sent = captureUpdate();
      await updateQuickbooksBill({ Id: '42', GlobalTaxCalculation: 'TaxExclusive' });
      expect(sent.payload.GlobalTaxCalculation).toBe('TaxExcluded');

      const bad = await updateQuickbooksBill({ Id: '42', GlobalTaxCalculation: 'Bogus' });
      expect(bad.isError).toBe(true);
      expect(bad.error).toContain('Valid values');
    });

    it('keeps TxnTaxDetail on a header-only edit but never echoes derived totals', async () => {
      const sent = captureUpdate();
      await updateQuickbooksBill({ Id: '42', PrivateNote: 'x' });

      expect(sent.payload.TxnTaxDetail).toEqual(taxedBill.TxnTaxDetail);
      for (const field of ['TotalAmt', 'HomeTotalAmt', 'Balance', 'HomeBalance']) {
        expect(sent.payload).not.toHaveProperty(field);
      }

      // ...but a derived field the caller supplies explicitly is still forwarded.
      await updateQuickbooksBill({ Id: '42', TotalAmt: 1113 });
      expect(sent.payload.TotalAmt).toBe(1113);
    });

    it('drops the stale TxnTaxDetail when lines change, unless the caller supplies one', async () => {
      const sent = captureUpdate();
      await updateQuickbooksBill({ Id: '42', Line: [{ Id: '2', Amount: 14 }] });
      expect(sent.payload).not.toHaveProperty('TxnTaxDetail');

      const override = { TotalTax: 1.82, TaxLine: [] };
      await updateQuickbooksBill({ Id: '42', Line: [{ Id: '2', Amount: 14 }], TxnTaxDetail: override });
      expect(sent.payload.TxnTaxDetail).toEqual(override);
    });

    it('errors when a header-only edit makes QuickBooks strip the tax', async () => {
      captureUpdate((payload) => ({ ...taxedBill, ...payload, TxnTaxDetail: { TotalTax: 0 }, TotalAmt: 1100 }));

      const result = await updateQuickbooksBill({ Id: '42', PrivateNote: 'x' });

      expect(result.isError).toBe(true);
      expect(result.error).toContain('tax total from 13.00 to 0.00');
      expect(result.error).toContain('1113.00 → 1100.00');
      expect(result.error).not.toContain('Also dropped');
    });

    it('reports dropped refs alongside a stripped tax total', async () => {
      captureUpdate(() => ({
        ...taxedBill,
        TxnTaxDetail: undefined,
        TotalAmt: undefined,
        Line: taxedBill.Line.map((l) => ({ ...l, AccountBasedExpenseLineDetail: { AccountRef: { value: '10' } } })),
      }));

      const result = await updateQuickbooksBill({ Id: '42', PrivateNote: 'x' });

      expect(result.isError).toBe(true);
      expect(result.error).toContain('tax total from 13.00 to 0.00');
      expect(result.error).toContain('1113.00 → 0.00');
      expect(result.error).toContain('Also dropped: Line 1: TaxCodeRef, Line 2: TaxCodeRef');
    });

    it('does not flag a tax change the caller asked for by editing lines', async () => {
      captureUpdate((payload) => ({ ...taxedBill, ...payload, TxnTaxDetail: { TotalTax: 1.82 } }));

      const result = await updateQuickbooksBill({ Id: '42', Line: [{ Id: '2', Amount: 14 }] });

      expect(result.isError).toBe(false);
    });
  });

  describe('deleteQuickbooksBill', () => {
    it('should delete a bill', async () => {
      const mockDeleted = { Id: '1', status: 'Deleted' };
      mockQuickBooksInstance.deleteBill.mockImplementation((_payload: any, cb: any) => cb(null, mockDeleted));

      const result = await deleteQuickbooksBill({ Id: '1', SyncToken: '0' });

      expect(result.isError).toBe(false);
      expect(result.result).toEqual(mockDeleted);
    });

    it('should handle API errors', async () => {
      mockQuickBooksInstance.deleteBill.mockImplementation((_payload: any, cb: any) =>
        cb(new Error('Delete failed'), null)
      );

      const result = await deleteQuickbooksBill({ Id: '1', SyncToken: '0' });

      expect(result.isError).toBe(true);
    });

    it('should handle authentication errors', async () => {
      (mockQuickbooksClientClass.getInstance as any).mockRejectedValue(new Error('Auth failed'));

      const result = await deleteQuickbooksBill({ Id: '1', SyncToken: '0' });

      expect(result.isError).toBe(true);
      expect(result.error).toContain('Error: Auth failed');
    });
  });

  describe('searchQuickbooksBills', () => {
    it('should search bills', async () => {
      const mockBills = [{ Id: '1', TotalAmt: 500 }, { Id: '2', TotalAmt: 300 }];
      mockQuickBooksInstance.findBills.mockImplementation((_criteria: any, cb: any) =>
        cb(null, { QueryResponse: { Bill: mockBills } })
      );

      const result = await searchQuickbooksBills({});

      expect(result.isError).toBe(false);
      expect(result.result).toEqual(mockBills);
    });

    it('should search bills with array criteria', async () => {
      mockQuickBooksInstance.findBills.mockImplementation((_criteria: any, cb: any) =>
        cb(null, { QueryResponse: { Bill: [{ Id: '1', TotalAmt: 500 }] } })
      );

      const result = await searchQuickbooksBills([
        { field: 'TotalAmt', value: '500', operator: '>' },
      ]);

      expect(result.isError).toBe(false);
      expect(result.result).toHaveLength(1);
    });

    it('should use default empty criteria when none provided', async () => {
      mockQuickBooksInstance.findBills.mockImplementation((_criteria: any, cb: any) =>
        cb(null, { QueryResponse: { Bill: [] } })
      );

      const result = await searchQuickbooksBills();

      expect(result.isError).toBe(false);
      expect(result.result).toEqual([]);
    });

    it('should return totalCount for count queries', async () => {
      mockQuickBooksInstance.findBills.mockImplementation((_criteria: any, cb: any) =>
        cb(null, { QueryResponse: { totalCount: 42 } })
      );

      const result = await searchQuickbooksBills({});

      expect(result.isError).toBe(false);
      expect(result.result).toBe(42);
    });

    it('should handle empty QueryResponse', async () => {
      mockQuickBooksInstance.findBills.mockImplementation((_criteria: any, cb: any) =>
        cb(null, { QueryResponse: {} })
      );

      const result = await searchQuickbooksBills({});

      expect(result.isError).toBe(false);
      expect(result.result).toEqual([]);
    });

    it('should handle API errors', async () => {
      mockQuickBooksInstance.findBills.mockImplementation((_criteria: any, cb: any) =>
        cb(new Error('Search failed'), null)
      );

      const result = await searchQuickbooksBills({});

      expect(result.isError).toBe(true);
    });

    it('should handle authentication errors', async () => {
      (mockQuickbooksClientClass.getInstance as any).mockRejectedValue(new Error('Auth failed'));

      const result = await searchQuickbooksBills({});

      expect(result.isError).toBe(true);
      expect(result.error).toContain('Error: Auth failed');
    });
  });
});


