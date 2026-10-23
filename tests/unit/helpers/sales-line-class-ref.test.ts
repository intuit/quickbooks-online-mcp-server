import { describe, it, expect, jest } from '@jest/globals';
import {
  applySalesCreateClassRefWarning,
  describeClassTrackingPreferenceHint,
  findClassRefMismatchedLineNumbers,
  formatSalesCreateError,
  lineItemsIncludeClassRef,
  NON_NUMERIC_CLASS_REF_ERROR,
  validateLineClassRefs,
} from '../../../src/helpers/sales-line-class-ref';

describe('sales-line-class-ref helpers', () => {
  describe('validateLineClassRefs', () => {
    it('returns null when class_ref is numeric or absent', () => {
      expect(validateLineClassRefs([{ class_ref: '682828' }, {}])).toBeNull();
    });

    it('rejects non-numeric class_ref values', () => {
      expect(validateLineClassRefs([{ class_ref: 'Restoration' }])).toBe(NON_NUMERIC_CLASS_REF_ERROR);
    });
  });

  describe('lineItemsIncludeClassRef', () => {
    it('detects when any line has class_ref', () => {
      expect(lineItemsIncludeClassRef([{}])).toBe(false);
      expect(lineItemsIncludeClassRef([{ class_ref: '1' }])).toBe(true);
    });
  });

  describe('describeClassTrackingPreferenceHint', () => {
    it('returns null when per-line tracking is enabled', () => {
      expect(
        describeClassTrackingPreferenceHint({ AccountingInfoPrefs: { ClassTrackingPerTxnLine: true } })
      ).toBeNull();
    });

    it('explains when class tracking is off', () => {
      const hint = describeClassTrackingPreferenceHint({
        AccountingInfoPrefs: { ClassTrackingPerTxn: false, ClassTrackingPerTxnLine: false },
      });
      expect(hint).toContain('Class tracking appears to be off');
    });

    it('explains per-transaction-only tracking', () => {
      const hint = describeClassTrackingPreferenceHint({
        AccountingInfoPrefs: { ClassTrackingPerTxn: true, ClassTrackingPerTxnLine: false },
      });
      expect(hint).toContain('one class per transaction');
    });

    it('reads nested Preferences.AccountingInfoPrefs', () => {
      const hint = describeClassTrackingPreferenceHint({
        Preferences: { AccountingInfoPrefs: { ClassTrackingPerTxn: true, ClassTrackingPerTxnLine: false } },
      });
      expect(hint).toContain('one class per transaction');
    });

    it('returns null for unrecognized preference shapes', () => {
      expect(describeClassTrackingPreferenceHint(null)).toBeNull();
      expect(describeClassTrackingPreferenceHint({})).toBeNull();
    });
  });

  describe('findClassRefMismatchedLineNumbers', () => {
    const savedWithSubtotal = {
      Line: [
        {
          DetailType: 'SalesItemLineDetail',
          SalesItemLineDetail: { ClassRef: { value: '682828' } },
        },
        { DetailType: 'SubTotalLineDetail', Amount: 10 },
        {
          DetailType: 'SalesItemLineDetail',
          SalesItemLineDetail: { ClassRef: { value: '682829' } },
        },
      ],
    };

    it('returns empty when every requested class_ref matches', () => {
      expect(
        findClassRefMismatchedLineNumbers(
          [{ class_ref: '682828' }, { class_ref: '682829' }],
          savedWithSubtotal
        )
      ).toEqual([]);
    });

    it('treats missing sales lines as mismatches when Line is absent', () => {
      expect(findClassRefMismatchedLineNumbers([{ class_ref: '682828' }], { Id: '1' })).toEqual([1]);
    });

    it('returns 1-based line numbers for partial mismatches', () => {
      expect(
        findClassRefMismatchedLineNumbers(
          [{ class_ref: '682828' }, {}, { class_ref: '682828' }],
          savedWithSubtotal
        )
      ).toEqual([3]);
    });
  });

  describe('applySalesCreateClassRefWarning', () => {
    const created = {
      Id: '169',
      Line: [
        {
          DetailType: 'SalesItemLineDetail',
          SalesItemLineDetail: { ItemRef: { value: '4' } },
        },
        { DetailType: 'SubTotalLineDetail', Amount: 1 },
      ],
    };

    it('returns the entity unchanged when no class_ref was requested', async () => {
      const quickbooks = { getPreferences: jest.fn() };
      const saved = { Id: '1' };

      const result = await applySalesCreateClassRefWarning(quickbooks, [{ item_ref: 'x' } as any], saved);

      expect(result).toBe(saved);
      expect(quickbooks.getPreferences).not.toHaveBeenCalled();
    });

    it('returns the entity unchanged when all class_ref values matched (no Preferences call)', async () => {
      const quickbooks = { getPreferences: jest.fn() };
      const saved = {
        Line: [
          {
            DetailType: 'SalesItemLineDetail',
            SalesItemLineDetail: { ClassRef: { value: '682828' } },
          },
        ],
      };

      const result = await applySalesCreateClassRefWarning(
        quickbooks,
        [{ class_ref: '682828' }],
        saved
      );

      expect(result).toEqual(saved);
      expect(quickbooks.getPreferences).not.toHaveBeenCalled();
    });

    it('attaches _warning with a prefs-tailored note when class_ref was dropped and tracking is off', async () => {
      const quickbooks = {
        getPreferences: (cb: (err: null, prefs: unknown) => void) =>
          cb(null, { AccountingInfoPrefs: { ClassTrackingPerTxn: false, ClassTrackingPerTxnLine: false } }),
      };

      const result = (await applySalesCreateClassRefWarning(
        quickbooks,
        [{ class_ref: '682828' }],
        created
      )) as { _warning: string };

      expect(result._warning).toBe(
        'Warning: QuickBooks saved this transaction but did not apply class_ref on line(s) 1. ' +
          'The transaction already exists, so do not retry the create; read or update that record (Id 169) instead. ' +
          'Class tracking appears to be off or unavailable on this company ' +
          '(QuickBooks Plus or Advanced with class tracking enabled is required). ' +
          'Line-level class_ref is not applicable.'
      );
    });

    it('uses a generic suffix when Preferences lookup fails', async () => {
      const quickbooks = {
        getPreferences: (cb: (err: Error, prefs: null) => void) => cb(new Error('prefs down'), null),
      };

      const result = (await applySalesCreateClassRefWarning(
        quickbooks,
        [{ class_ref: '682828' }],
        created
      )) as { _warning: string };

      expect(result._warning).toBe(
        'Warning: QuickBooks saved this transaction but did not apply class_ref on line(s) 1. ' +
          'The transaction already exists, so do not retry the create; read or update that record (Id 169) instead. ' +
          'Line-level class tracking may be disabled or misconfigured in this company.'
      );
    });

    it('uses a generic suffix when preferences do not explain the drop', async () => {
      const quickbooks = {
        getPreferences: (cb: (err: null, prefs: unknown) => void) =>
          cb(null, { AccountingInfoPrefs: { ClassTrackingPerTxnLine: true, ClassTrackingPerTxn: false } }),
      };

      const result = (await applySalesCreateClassRefWarning(
        quickbooks,
        [{ class_ref: '682828' }],
        created
      )) as { _warning: string };

      expect(result._warning).toBe(
        'Warning: QuickBooks saved this transaction but did not apply class_ref on line(s) 1. ' +
          'The transaction already exists, so do not retry the create; read or update that record (Id 169) instead. ' +
          'Line-level class tracking may be disabled or misconfigured in this company.'
      );
    });

    it('lists every mismatched line on a multi-line request', async () => {
      const quickbooks = {
        getPreferences: (cb: (err: null, prefs: unknown) => void) =>
          cb(null, { AccountingInfoPrefs: { ClassTrackingPerTxn: false, ClassTrackingPerTxnLine: false } }),
      };
      const multiSaved = {
        Line: [
          { DetailType: 'SalesItemLineDetail', SalesItemLineDetail: {} },
          { DetailType: 'SalesItemLineDetail', SalesItemLineDetail: { ClassRef: { value: '682829' } } },
          { DetailType: 'SalesItemLineDetail', SalesItemLineDetail: {} },
        ],
      };

      const result = (await applySalesCreateClassRefWarning(
        quickbooks,
        [{ class_ref: '682828' }, { class_ref: '682829' }, { class_ref: '682828' }],
        multiSaved
      )) as { _warning: string };

      expect(result._warning).toContain('line(s) 1, 3');
      // No Id on the saved entity: still tell the caller not to retry the create.
      expect(result._warning).toContain(
        'The transaction already exists, so do not retry the create; read or update that record instead.'
      );
      expect(result._warning).not.toContain('(Id ');
    });
  });

  describe('formatSalesCreateError', () => {
    it('uses formatError and does not append a note when per-line tracking is enabled', async () => {
      const getPreferences = jest.fn((cb: (err: null, prefs: unknown) => void) =>
        cb(null, { AccountingInfoPrefs: { ClassTrackingPerTxnLine: true } })
      );
      const quickbooks = { getPreferences };
      const err = new Error('Request failed with status code 400');

      const message = await formatSalesCreateError(quickbooks, err, [{ class_ref: '999999' }]);

      expect(message).toBe('Error: Request failed with status code 400');
      expect(getPreferences).toHaveBeenCalledTimes(1);
    });

    it('skips preferences lookup when no class_ref was sent', async () => {
      const quickbooks = { getPreferences: jest.fn() };
      const err = new Error('Request failed with status code 400');

      await formatSalesCreateError(quickbooks, err, [{}]);

      expect(quickbooks.getPreferences).not.toHaveBeenCalled();
    });

    it('appends a class tracking note when preferences show tracking is off', async () => {
      const quickbooks = {
        getPreferences: (cb: (err: null, prefs: unknown) => void) =>
          cb(null, { AccountingInfoPrefs: { ClassTrackingPerTxn: false, ClassTrackingPerTxnLine: false } }),
      };
      const err = new Error('Request failed with status code 400');

      const message = await formatSalesCreateError(quickbooks, err, [{ class_ref: '999999' }]);

      expect(message).toBe(
        'Error: Request failed with status code 400\n\n' +
          'Class tracking note: Class tracking appears to be off or unavailable on this company ' +
          '(QuickBooks Plus or Advanced with class tracking enabled is required). ' +
          'Line-level class_ref is not applicable.'
      );
    });

    it('returns formatError output when preferences lookup fails', async () => {
      const quickbooks = {
        getPreferences: (cb: (err: Error, prefs: null) => void) => cb(new Error('prefs failed'), null),
      };
      const err = new Error('Request failed with status code 400');

      const message = await formatSalesCreateError(quickbooks, err, [{ class_ref: '999999' }]);

      expect(message).toBe('Error: Request failed with status code 400');
    });
  });
});
