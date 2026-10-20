import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { mockQuickbooksClient, mockQuickbooksClientClass, mockQuickBooksInstance, resetAllMocks } from '../../mocks/quickbooks.mock';

// ESM-compatible module mocking
jest.unstable_mockModule('../../../src/clients/quickbooks-client', () => ({
  quickbooksClient: mockQuickbooksClient,
  QuickbooksClient: mockQuickbooksClientClass,
}));

// Dynamic imports after mock setup
const { updateQuickbooksEstimate } = await import('../../../src/handlers/update-quickbooks-estimate.handler');

describe('updateQuickbooksEstimate (sparse)', () => {
  beforeEach(() => {
    resetAllMocks();
  });

  it('fetches the current estimate and sends a sparse update with its SyncToken', async () => {
    const existing = {
      Id: '42',
      SyncToken: '3',
      CustomerRef: { value: '7' },
      CustomerMemo: { value: 'Thanks!' },
      Line: [{ Amount: 100 }],
    };
    mockQuickBooksInstance.getEstimate.mockImplementation((id: any, cb: any) => cb(null, existing));
    mockQuickBooksInstance.updateEstimate.mockImplementation((payload: any, cb: any) => cb(null, { ...payload, SyncToken: '4' }));

    const result = await updateQuickbooksEstimate({ estimate_id: '42', patch: { TxnDate: '2026-10-05' } });

    expect(result.isError).toBe(false);
    expect((mockQuickBooksInstance.getEstimate.mock.calls[0] as any)[0]).toBe('42');
    const payload = (mockQuickBooksInstance.updateEstimate.mock.calls[0] as any)[0];
    expect(payload).toMatchObject({
      Id: '42',
      SyncToken: '3',
      sparse: true,
      TxnDate: '2026-10-05',
      CustomerMemo: { value: 'Thanks!' },
    });
  });

  it('does not let the patch override Id or sparse', async () => {
    mockQuickBooksInstance.getEstimate.mockImplementation((id: any, cb: any) => cb(null, { Id: '42', SyncToken: '0' }));
    mockQuickBooksInstance.updateEstimate.mockImplementation((payload: any, cb: any) => cb(null, payload));

    await updateQuickbooksEstimate({ estimate_id: '42', patch: { Id: '99', sparse: false } });

    const payload = (mockQuickBooksInstance.updateEstimate.mock.calls[0] as any)[0];
    expect(payload.Id).toBe('42');
    expect(payload.sparse).toBe(true);
  });

  it('returns an error without updating when the estimate cannot be fetched', async () => {
    mockQuickBooksInstance.getEstimate.mockImplementation((id: any, cb: any) => cb(new Error('Object Not Found')));

    const result = await updateQuickbooksEstimate({ estimate_id: 'nope', patch: {} });

    expect(result.isError).toBe(true);
    expect(result.error).toContain('Object Not Found');
    expect(mockQuickBooksInstance.updateEstimate).not.toHaveBeenCalled();
  });

  it('returns an error when the update call fails', async () => {
    mockQuickBooksInstance.getEstimate.mockImplementation((id: any, cb: any) => cb(null, { Id: '42', SyncToken: '0' }));
    mockQuickBooksInstance.updateEstimate.mockImplementation((payload: any, cb: any) => cb(new Error('Stale object')));

    const result = await updateQuickbooksEstimate({ estimate_id: '42', patch: {} });

    expect(result.isError).toBe(true);
    expect(result.error).toContain('Stale object');
  });
});
