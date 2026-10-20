import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { mockQuickbooksClient, mockQuickbooksClientClass, mockQuickBooksInstance, resetAllMocks } from '../../mocks/quickbooks.mock';

jest.unstable_mockModule('../../../src/clients/quickbooks-client', () => ({
  quickbooksClient: mockQuickbooksClient,
  QuickbooksClient: mockQuickbooksClientClass,
}));

const { deleteQuickbooksInvoice } = await import('../../../src/handlers/delete-quickbooks-invoice.handler');
const { deleteQuickbooksPayment } = await import('../../../src/handlers/delete-quickbooks-payment.handler');
const { DeleteInvoiceTool } = await import('../../../src/tools/delete-invoice.tool');
const { DeletePaymentTool } = await import('../../../src/tools/delete-payment.tool');
const { runConfirmedAction, summarizeRecord } = await import('../../../src/helpers/confirm-flow');
const { _resetConfirmationState, issueConfirmationCode, CONFIRMATION_TTL_MS } = await import('../../../src/helpers/confirmation-code');

const cases: Array<{ label: string; get: string; voidFn: string; handler: any; tool: any; entity: string; record: any }> = [
  {
    label: 'invoice', get: 'getInvoice', voidFn: 'voidInvoice', handler: deleteQuickbooksInvoice, tool: DeleteInvoiceTool, entity: 'invoice',
    record: { Id: '9', SyncToken: '3', DocNumber: '1001', TxnDate: '2026-01-02', TotalAmt: 1250, CustomerRef: { name: 'Acme' }, Line: [{}, {}] },
  },
  {
    label: 'payment', get: 'getPayment', voidFn: 'voidPayment', handler: deleteQuickbooksPayment, tool: DeletePaymentTool, entity: 'payment',
    record: { Id: '9', SyncToken: '3', TxnDate: '2026-01-02', TotalAmt: 50, CustomerRef: { name: 'Acme' } },
  },
];

describe.each(cases)('void: $label', ({ get, voidFn, handler, tool, entity, record }) => {
  const getMock = () => (mockQuickBooksInstance as any)[get];
  const voidMock = () => (mockQuickBooksInstance as any)[voidFn];
  let current: any;

  beforeEach(() => {
    resetAllMocks();
    _resetConfirmationState();
    current = { ...record };
    getMock().mockImplementation((_id: any, cb: any) => cb(null, current));
    voidMock().mockImplementation((payload: any, cb: any) => cb(null, { ...payload, voided: true }));
  });

  const step1 = async () => (await handler({ id: '9' })).result;

  it('without a code returns a summary and code and never voids', async () => {
    const response = await handler({ id: '9' });
    expect(response.isError).toBe(false);
    expect(response.result.status).toBe('confirmation_required');
    expect(response.result.action).toBe('void');
    expect(response.result.expires_in_minutes).toBe(10);
    expect(response.result.confirmation_code).toEqual(expect.any(String));
    expect(response.result.summary).toContain('$');
    expect(response.result.summary).toContain('will be voided');
    expect(voidMock()).not.toHaveBeenCalled();
  });

  it('with a valid code voids once using the fetched SyncToken', async () => {
    const { confirmation_code } = await step1();
    const response = await handler({ id: '9', confirmation_code });
    expect(response.isError).toBe(false);
    expect(voidMock()).toHaveBeenCalledTimes(1);
    expect(voidMock().mock.calls[0][0]).toMatchObject({ Id: '9', SyncToken: '3' });
  });

  it('refuses a reused code', async () => {
    const { confirmation_code } = await step1();
    await handler({ id: '9', confirmation_code });
    const again = await handler({ id: '9', confirmation_code });
    expect(again.isError).toBe(true);
    expect(voidMock()).toHaveBeenCalledTimes(1);
  });

  it('refuses when the SyncToken changed and asks for a new code', async () => {
    const { confirmation_code } = await step1();
    current = { ...current, SyncToken: '4' };
    const response = await handler({ id: '9', confirmation_code });
    expect(response.isError).toBe(true);
    expect(response.error).toContain('request a new code'.replace('request', 'Call again without confirmation_code to request'));
    expect(voidMock()).not.toHaveBeenCalled();
  });

  it('refuses an expired code', async () => {
    const stale = issueConfirmationCode({ entity, id: '9', syncToken: '3', action: 'void' }, Date.now() - CONFIRMATION_TTL_MS - 1000);
    const response = await handler({ id: '9', confirmation_code: stale });
    expect(response.isError).toBe(true);
    expect(response.error).toContain('expired');
    expect(voidMock()).not.toHaveBeenCalled();
  });

  it('refuses a garbage code', async () => {
    const response = await handler({ id: '9', confirmation_code: 'nope' });
    expect(response.isError).toBe(true);
    expect(voidMock()).not.toHaveBeenCalled();
  });

  it('errors when the fetch fails', async () => {
    getMock().mockImplementation((_id: any, cb: any) => cb(new Error('Object Not Found')));
    const response = await handler({ id: '9' });
    expect(response.isError).toBe(true);
    expect(response.error).toContain('Object Not Found');
  });

  it('errors when the record is empty', async () => {
    getMock().mockImplementation((_id: any, cb: any) => cb(null, null));
    const response = await handler({ id: '9' });
    expect(response.isError).toBe(true);
    expect(response.error).toContain('not found');
  });

  it('errors when the void fails', async () => {
    const { confirmation_code } = await step1();
    voidMock().mockImplementation((_p: any, cb: any) => cb(new Error('Void failed')));
    const response = await handler({ id: '9', confirmation_code });
    expect(response.isError).toBe(true);
    expect(response.error).toContain('Void failed');
  });

  it('errors on authentication failure', async () => {
    (mockQuickbooksClientClass.getInstance as any).mockRejectedValue(new Error('Auth failed'));
    const response = await handler({ id: '9' });
    expect(response.isError).toBe(true);
    expect(response.error).toContain('Auth failed');
  });

  it('tool: schema, step-1 text tells the AI to ask the user', async () => {
    expect(tool.schema.safeParse({ id: '9' }).success).toBe(true);
    expect(tool.schema.safeParse({ id: '' }).success).toBe(false);
    expect(tool.description).toContain('Two steps');
    const out = await tool.handler({ params: { id: '9' } });
    const text = out.content.map((c: any) => c.text).join('\n');
    expect(text).toContain('Confirmation required');
    expect(text).toContain('confirmation_code:');
    expect(text).toContain('ask');
  });

  it('tool: step 2 reports success, errors report an error', async () => {
    const { confirmation_code } = await step1();
    const ok = await tool.handler({ params: { id: '9', confirmation_code } });
    expect(ok.content[0].text).toContain('voided');
    const bad = await tool.handler({ params: { id: '9', confirmation_code } });
    expect(bad.content[0].text).toContain('Error voiding');
  });
});

describe('invoice never hard-deletes', () => {
  it('does not call deleteInvoice', async () => {
    resetAllMocks();
    _resetConfirmationState();
    mockQuickBooksInstance.getInvoice.mockImplementation((_i: any, cb: any) => cb(null, { Id: '1', SyncToken: '0' }));
    mockQuickBooksInstance.voidInvoice.mockImplementation((_p: any, cb: any) => cb(null, {}));
    const { result } = await deleteQuickbooksInvoice({ id: '1' });
    await deleteQuickbooksInvoice({ id: '1', confirmation_code: result.confirmation_code });
    expect(mockQuickBooksInstance.voidInvoice).toHaveBeenCalledTimes(1);
    expect(mockQuickBooksInstance.deleteInvoice).not.toHaveBeenCalled();
  });
});

describe('runConfirmedAction / summarizeRecord', () => {
  it('uses the delete wording and is entity-agnostic', async () => {
    _resetConfirmationState();
    const perform = jest.fn(async () => ({ gone: true }));
    const base = { entity: 'bill', id: '5', action: 'delete' as const, fetch: async () => ({ Id: '5', SyncToken: '1' }), summarize: () => 's', perform };
    const first = await runConfirmedAction(base);
    const bad = await runConfirmedAction({ ...base, confirmationCode: 'x.y' });
    expect(bad.error).toContain('Nothing was deleted');
    const ok = await runConfirmedAction({ ...base, confirmationCode: first.result.confirmation_code });
    expect(ok.result).toEqual({ gone: true });
    expect(perform).toHaveBeenCalledTimes(1);
  });

  it('summary omits missing parts and falls back to Id and Vendor/Entity names', () => {
    expect(summarizeRecord('Payment', { Id: '7' }, 'voided')).toBe('Payment #7 — will be voided');
    expect(summarizeRecord('X', { Id: '7', DocNumber: 'D1', TotalAmt: 1234.5, VendorRef: { name: 'V' } }, 'voided')).toBe('X #D1, total $1,234.50, V — will be voided');
    expect(summarizeRecord('X', { Id: '7', EntityRef: { name: 'E' }, TxnDate: '2026-02-03', Line: [] }, 'voided')).toBe('X #7, dated 2026-02-03, E, 0 lines — will be voided');
  });
});
