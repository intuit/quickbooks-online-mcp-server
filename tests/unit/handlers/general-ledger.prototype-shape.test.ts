/**
 * Prototype-shape contract test for get_general_ledger.
 *
 * Exercises the handler against the real node-quickbooks prototype (not the
 * hand-rolled mock) so any future drift between the handler's method name and
 * the library's prototype method name fails loudly in CI without needing
 * network or credentials.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import QuickBooks from 'node-quickbooks';

const mockQuickbooksClient = {
  authenticate: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  getQuickbooks: jest.fn<() => QuickBooks>(),
};

// Post-PR #41, handlers import the QuickbooksClient class and call its
// static getInstance(). Provide a mock for both shapes so this test stays
// black-box against the handler's auth pattern.
const mockQuickbooksClientClass = {
  getInstance: jest.fn<() => Promise<QuickBooks>>(),
};

jest.unstable_mockModule('../../../src/clients/quickbooks-client', () => ({
  quickbooksClient: mockQuickbooksClient,
  QuickbooksClient: mockQuickbooksClientClass,
}));

const { getQuickbooksGeneralLedger } = await import('../../../src/handlers/get-quickbooks-general-ledger.handler');

describe('get_general_ledger prototype-shape contract', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    mockQuickbooksClient.authenticate.mockResolvedValue(undefined);
  });

  it('node-quickbooks exposes reportGeneralLedgerDetail on its prototype', () => {
    expect(typeof (QuickBooks.prototype as any).reportGeneralLedgerDetail).toBe('function');
  });

  it('handler invokes a method that exists on the real QuickBooks prototype', async () => {
    const qb = Object.create(QuickBooks.prototype) as QuickBooks;
    mockQuickbooksClient.getQuickbooks.mockReturnValue(qb);
    mockQuickbooksClientClass.getInstance.mockResolvedValue(qb);

    const spy = jest
      .spyOn(QuickBooks.prototype as any, 'reportGeneralLedgerDetail')
      .mockImplementation(function (this: unknown, _params: any, cb: any) {
        cb(null, { Header: { ReportName: 'GeneralLedger' } });
      });

    const result = await getQuickbooksGeneralLedger({ start_date: '2024-01-01', end_date: '2024-01-31' });

    expect(spy).toHaveBeenCalledTimes(1);
    expect(result.isError).toBe(false);
    expect(result.result).toMatchObject({ Header: { ReportName: 'GeneralLedger' } });
  });
});
