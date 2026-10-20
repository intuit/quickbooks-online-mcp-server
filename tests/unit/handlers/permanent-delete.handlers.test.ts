import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { mockQuickbooksClient, mockQuickbooksClientClass, mockQuickBooksInstance, resetAllMocks } from '../../mocks/quickbooks.mock';

jest.unstable_mockModule('../../../src/clients/quickbooks-client', () => ({
  quickbooksClient: mockQuickbooksClient,
  QuickbooksClient: mockQuickbooksClientClass,
}));

const imp = async (h: string, t: string, name: string) => ({
  handler: (await import(`../../../src/handlers/delete-quickbooks-${h}.handler`) as any)[`deleteQuickbooks${name}`],
  tool: (await import(`../../../src/tools/delete-${t}.tool`) as any)[`Delete${name}Tool`],
});
const { summarizeRecord } = await import('../../../src/helpers/confirm-flow');
const { _resetConfirmationState, issueConfirmationCode, CONFIRMATION_TTL_MS } = await import('../../../src/helpers/confirmation-code');

const defs: Array<[string, string, string, string, string]> = [
  // label, file stem, Pascal name (node-quickbooks suffix), entity string, tool-name
  ['journal entry', 'journal-entry', 'JournalEntry', 'journalEntry', 'delete_journal_entry'],
  ['deposit', 'deposit', 'Deposit', 'deposit', 'delete_deposit'],
  ['transfer', 'transfer', 'Transfer', 'transfer', 'delete_transfer'],
  ['purchase', 'purchase', 'Purchase', 'purchase', 'delete_purchase'],
  ['bill', 'bill', 'Bill', 'bill', 'delete-bill'],
  ['estimate', 'estimate', 'Estimate', 'estimate', 'delete_estimate'],
  ['credit memo', 'credit-memo', 'CreditMemo', 'creditMemo', 'delete_credit_memo'],
  ['vendor credit', 'vendor-credit', 'VendorCredit', 'vendorCredit', 'delete_vendor_credit'],
  ['purchase order', 'purchase-order', 'PurchaseOrder', 'purchaseOrder', 'delete_purchase_order'],
  ['time activity', 'time-activity', 'TimeActivity', 'timeActivity', 'delete_time_activity'],
  ['attachable', 'attachable', 'Attachable', 'attachable', 'delete_attachable'],
];
const loaded: any[] = [];
for (const d of defs) loaded.push({ d, ...(await imp(d[1], d[1], d[2])) });
const cases = loaded.map(({ d, handler, tool }) => ({ label: d[0], name: d[2], entity: d[3], toolName: d[4], handler, tool }));

describe.each(cases)('permanent delete: $label', ({ name, entity, toolName, handler, tool }) => {
  const getMock = () => (mockQuickBooksInstance as any)[`get${name}`];
  const delMock = () => (mockQuickBooksInstance as any)[`delete${name}`];
  let current: any;

  beforeEach(() => {
    resetAllMocks();
    _resetConfirmationState();
    current = { Id: '9', SyncToken: '3', DocNumber: 'D9', TxnDate: '2026-01-02', TotalAmt: 75, VendorRef: { name: 'Acme' }, Line: [{}] };
    getMock().mockImplementation((_id: any, cb: any) => cb(null, current));
    delMock().mockImplementation((payload: any, cb: any) => cb(null, { ...payload, deleted: true }));
  });

  const step1 = async () => (await handler({ id: '9' })).result;

  it('(a) without a code returns a summary and code and never deletes', async () => {
    const response = await handler({ id: '9' });
    expect(response.isError).toBe(false);
    expect(response.result.status).toBe('confirmation_required');
    expect(response.result.action).toBe('delete');
    expect(response.result.expires_in_minutes).toBe(10);
    expect(response.result.confirmation_code).toEqual(expect.any(String));
    expect(response.result.summary).toContain('will be permanently deleted');
    expect(delMock()).not.toHaveBeenCalled();
  });

  it('(b) with a valid code deletes once using the freshly fetched record', async () => {
    const { confirmation_code } = await step1();
    const response = await handler({ id: '9', confirmation_code });
    expect(response.isError).toBe(false);
    expect(delMock()).toHaveBeenCalledTimes(1);
    expect(delMock().mock.calls[0][0]).toMatchObject({ Id: '9', SyncToken: '3' });
  });

  it('(c) refuses a reused code', async () => {
    const { confirmation_code } = await step1();
    await handler({ id: '9', confirmation_code });
    const again = await handler({ id: '9', confirmation_code });
    expect(again.isError).toBe(true);
    expect(delMock()).toHaveBeenCalledTimes(1);
  });

  it('(d) refuses when the SyncToken changed and asks for a new code', async () => {
    const { confirmation_code } = await step1();
    current = { ...current, SyncToken: '4' };
    const response = await handler({ id: '9', confirmation_code });
    expect(response.isError).toBe(true);
    expect(response.error).toContain('Call again without confirmation_code to request a new code');
    expect(delMock()).not.toHaveBeenCalled();
  });

  it('(e) refuses an expired code and a garbage code', async () => {
    const stale = issueConfirmationCode({ entity, id: '9', syncToken: '3', action: 'delete' }, Date.now() - CONFIRMATION_TTL_MS - 1000);
    const expired = await handler({ id: '9', confirmation_code: stale });
    expect(expired.isError).toBe(true);
    expect(expired.error).toContain('expired');
    const junk = await handler({ id: '9', confirmation_code: 'nope' });
    expect(junk.isError).toBe(true);
    expect(delMock()).not.toHaveBeenCalled();
  });

  it('a void code does not work for a delete', async () => {
    const voidCode = issueConfirmationCode({ entity, id: '9', syncToken: '3', action: 'void' });
    const response = await handler({ id: '9', confirmation_code: voidCode });
    expect(response.isError).toBe(true);
    expect(delMock()).not.toHaveBeenCalled();
  });

  it('errors when the fetch fails, the record is empty, or the delete fails', async () => {
    getMock().mockImplementation((_id: any, cb: any) => cb(new Error('Object Not Found')));
    expect((await handler({ id: '9' })).error).toContain('Object Not Found');
    getMock().mockImplementation((_id: any, cb: any) => cb(null, null));
    expect((await handler({ id: '9' })).error).toContain('not found');
    getMock().mockImplementation((_id: any, cb: any) => cb(null, current));
    const { confirmation_code } = await step1();
    delMock().mockImplementation((_p: any, cb: any) => cb(new Error('Delete failed')));
    const failed = await handler({ id: '9', confirmation_code });
    expect(failed.isError).toBe(true);
    expect(failed.error).toContain('Delete failed');
  });

  it('errors on authentication failure', async () => {
    (mockQuickbooksClientClass.getInstance as any).mockRejectedValue(new Error('Auth failed'));
    const response = await handler({ id: '9' });
    expect(response.isError).toBe(true);
    expect(response.error).toContain('Auth failed');
  });

  it('tool: name, schema, description and step texts', async () => {
    expect(tool.name).toBe(toolName);
    expect(tool.schema.safeParse({ id: '9' }).success).toBe(true);
    expect(tool.schema.safeParse({ id: '9', confirmation_code: 'x' }).success).toBe(true);
    expect(tool.schema.safeParse({ id: '' }).success).toBe(false);
    expect(tool.description).toContain('Permanently deletes');
    expect(tool.description).toContain('cannot be undone');
    expect(tool.description).toContain('Two steps');
    const out = await tool.handler({ params: { id: '9' } });
    const text = out.content.map((c: any) => c.text).join('\n');
    expect(text).toContain('Confirmation required');
    expect(text).toContain('confirmation_code:');
    expect(text).toContain('ask');
    const { confirmation_code } = await step1();
    const ok = await tool.handler({ params: { id: '9', confirmation_code } });
    expect(ok.content[0].text).toContain('deleted');
    const bad = await tool.handler({ params: { id: '9', confirmation_code } });
    expect(bad.content[0].text).toContain('Error deleting');
  });

  it('tool: the old idOrEntity input is rejected naming id, and QuickBooks is not called', async () => {
    const parsed = tool.schema.safeParse({ idOrEntity: '5' });
    expect(parsed.success).toBe(false);
    expect(JSON.stringify((parsed as any).error.issues)).toContain('"id"');
    expect(getMock()).not.toHaveBeenCalled();
    expect(delMock()).not.toHaveBeenCalled();
  });
});

describe('summarizeRecord edge cases', () => {
  it('names the employee on time activities and the file on attachables', () => {
    expect(summarizeRecord('Time activity', { Id: '3', TxnDate: '2026-03-04', EmployeeRef: { name: 'Pat Lee' } }, 'deleted'))
      .toBe('Time activity #3, dated 2026-03-04, Pat Lee — will be deleted');
    expect(summarizeRecord('Attachable', { Id: '4', FileName: 'receipt.pdf' }, 'deleted'))
      .toBe('Attachable #4, file receipt.pdf — will be deleted');
    expect(summarizeRecord('X', { Id: '5', CustomerRef: { name: 'Acme' }, EmployeeRef: { name: 'Pat' } }, 'deleted'))
      .toBe('X #5, Acme — will be deleted');
  });

  it('pluralises lines and treats an empty DocNumber like a missing one', () => {
    expect(summarizeRecord('X', { Id: '7', Line: [{}] }, 'deleted')).toBe('X #7, 1 line — will be deleted');
    expect(summarizeRecord('X', { Id: '7', Line: [{}, {}] }, 'deleted')).toBe('X #7, 2 lines — will be deleted');
    expect(summarizeRecord('X', { Id: '7', DocNumber: '' }, 'deleted')).toBe('X #7 — will be deleted');
  });
});
