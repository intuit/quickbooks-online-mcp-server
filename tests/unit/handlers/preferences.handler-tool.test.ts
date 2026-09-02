import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  mockQuickbooksClient,
  mockQuickbooksClientClass,
  mockQuickBooksInstance,
  resetAllMocks,
} from '../../mocks/quickbooks.mock';

jest.unstable_mockModule('../../../src/clients/quickbooks-client', () => ({
  quickbooksClient: mockQuickbooksClient,
  QuickbooksClient: mockQuickbooksClientClass,
}));

const { getQuickbooksPreferences } = await import('../../../src/handlers/get-quickbooks-preferences.handler');
const { GetPreferencesTool } = await import('../../../src/tools/get-preferences.tool');

describe('Preferences handler and tool', () => {
  beforeEach(() => {
    resetAllMocks();
  });

  it('returns the complete company preferences payload', async () => {
    const preferences = {
      AccountingInfoPrefs: { ClassTrackingPerTxn: true },
      ProductAndServicesPrefs: { ForPurchase: true },
      SalesFormsPrefs: { ETransactionPaymentEnabled: false },
    };
    mockQuickBooksInstance.getPreferences.mockImplementation((cb: any) => cb(null, preferences));

    const result = await getQuickbooksPreferences();

    expect(mockQuickBooksInstance.getPreferences).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ result: preferences, isError: false, error: null });
  });

  it('returns a formatted QuickBooks API error', async () => {
    mockQuickBooksInstance.getPreferences.mockImplementation((cb: any) =>
      cb(new Error('Preferences read failed'), null)
    );

    const result = await getQuickbooksPreferences();

    expect(result.isError).toBe(true);
    expect(result.error).toContain('Preferences read failed');
  });

  it('returns a formatted authentication error', async () => {
    (mockQuickbooksClientClass.getInstance as any).mockRejectedValue(new Error('Auth failed'));

    const result = await getQuickbooksPreferences();

    expect(result.isError).toBe(true);
    expect(result.error).toContain('Auth failed');
  });

  it('exposes a parameterless read tool and serializes successful responses', async () => {
    const preferences = { AccountingInfoPrefs: { DefaultTaxRateRef: { value: '2' } } };
    mockQuickBooksInstance.getPreferences.mockImplementation((cb: any) => cb(null, preferences));

    const result = await GetPreferencesTool.handler({ params: {} } as any, {} as any);

    expect(GetPreferencesTool.name).toBe('get_preferences');
    expect(GetPreferencesTool.schema.parse({})).toEqual({});
    expect(result).toEqual({
      content: [{ type: 'text', text: JSON.stringify(preferences, null, 2) }],
    });
  });

  it('serializes handler errors for MCP clients', async () => {
    mockQuickBooksInstance.getPreferences.mockImplementation((cb: any) =>
      cb(new Error('Not authorized'), null)
    );

    const result = await GetPreferencesTool.handler({ params: {} } as any, {} as any);

    expect(result).toEqual({
      content: [{ type: 'text', text: 'Error: Error: Not authorized' }],
    });
  });
});
