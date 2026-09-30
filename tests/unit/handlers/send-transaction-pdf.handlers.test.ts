import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { mockQuickbooksClient, mockQuickbooksClientClass, mockQuickBooksInstance, resetAllMocks } from '../../mocks/quickbooks.mock';

jest.unstable_mockModule('../../../src/clients/quickbooks-client', () => ({
  quickbooksClient: mockQuickbooksClient,
  QuickbooksClient: mockQuickbooksClientClass,
}));

const { sendQuickbooksInvoice } = await import('../../../src/handlers/send-quickbooks-invoice.handler');
const { sendQuickbooksEstimate } = await import('../../../src/handlers/send-quickbooks-estimate.handler');

// Both handlers share one implementation; run the same behavioral suite
// against each so a wiring mistake (wrong get/send method) in either fails.
const cases = [
  {
    name: 'sendQuickbooksInvoice',
    send: sendQuickbooksInvoice,
    getMock: () => mockQuickBooksInstance.getInvoice,
    sendMock: () => mockQuickBooksInstance.sendInvoicePdf,
    label: 'Invoice',
  },
  {
    name: 'sendQuickbooksEstimate',
    send: sendQuickbooksEstimate,
    getMock: () => mockQuickBooksInstance.getEstimate,
    sendMock: () => mockQuickBooksInstance.sendEstimatePdf,
    label: 'Estimate',
  },
];

describe.each(cases)('$name', ({ send, getMock, sendMock, label }) => {
  const unsent = { Id: '42', EmailStatus: 'NeedToSend', BillEmail: { Address: 'billing@example.com' } };

  const stubGet = (entity: any) =>
    getMock().mockImplementation((_id: any, cb: any) => cb(null, entity));
  const stubSend = (err: any, result: any) =>
    sendMock().mockImplementation((_id: any, _to: any, cb: any) => cb(err, result));

  beforeEach(() => {
    resetAllMocks();
  });

  it('sends to the stored BillEmail when send_to is omitted', async () => {
    stubGet(unsent);
    const sent = { ...unsent, EmailStatus: 'EmailSent' };
    stubSend(null, sent);

    const result = await send('42');

    expect(result).toEqual({ result: sent, isError: false, error: null });
    expect(getMock()).toHaveBeenCalledWith('42', expect.any(Function));
    expect(sendMock()).toHaveBeenCalledWith('42', undefined, expect.any(Function));
  });

  it('URL-encodes the send_to override before it reaches node-quickbooks', async () => {
    stubGet(unsent);
    stubSend(null, { ...unsent, EmailStatus: 'EmailSent' });

    const result = await send('42', { sendTo: 'a+b@example.com' });

    expect(result.isError).toBe(false);
    expect(sendMock()).toHaveBeenCalledWith('42', 'a%2Bb%40example.com', expect.any(Function));
  });

  it('refuses to resend an already-emailed document and does not call send', async () => {
    stubGet({ ...unsent, EmailStatus: 'EmailSent' });

    const result = await send('42');

    expect(result.isError).toBe(true);
    expect(result.result).toBeNull();
    expect(result.error).toContain(`${label} 42 was already emailed`);
    expect(result.error).toContain('allow_resend');
    expect(sendMock()).not.toHaveBeenCalled();
  });

  it('resends an already-emailed document when allowResend is true', async () => {
    stubGet({ ...unsent, EmailStatus: 'EmailSent' });
    stubSend(null, { ...unsent, EmailStatus: 'EmailSent' });

    const result = await send('42', { allowResend: true });

    expect(result.isError).toBe(false);
    expect(sendMock()).toHaveBeenCalledTimes(1);
  });

  it('refuses when there is no BillEmail and no send_to, without calling send', async () => {
    stubGet({ Id: '42', EmailStatus: 'NotSet' });

    const result = await send('42');

    expect(result.isError).toBe(true);
    expect(result.error).toContain(`${label} 42 has no BillEmail address`);
    expect(sendMock()).not.toHaveBeenCalled();
  });

  it('sends to send_to when the document has no BillEmail', async () => {
    stubGet({ Id: '42', EmailStatus: 'NotSet' });
    stubSend(null, { Id: '42', EmailStatus: 'EmailSent' });

    const result = await send('42', { sendTo: 'ap@example.com' });

    expect(result.isError).toBe(false);
    expect(sendMock()).toHaveBeenCalledWith('42', 'ap%40example.com', expect.any(Function));
  });

  it('returns isError when QBO rejects the send', async () => {
    stubGet(unsent);
    stubSend(new Error('Business Validation Error: invalid email'), null);

    const result = await send('42');

    expect(result.isError).toBe(true);
    expect(result.result).toBeNull();
    expect(result.error).toBe('Error: Business Validation Error: invalid email');
  });

  it('returns isError and does not send when the read fails', async () => {
    getMock().mockImplementation((_id: any, cb: any) => cb(new Error('Object Not Found'), null));

    const result = await send('404');

    expect(result.isError).toBe(true);
    expect(result.error).toContain('Object Not Found');
    expect(sendMock()).not.toHaveBeenCalled();
  });

  it('returns isError when authentication fails', async () => {
    (mockQuickbooksClientClass.getInstance as any).mockRejectedValue(new Error('Auth failed'));

    const result = await send('42');

    expect(result.isError).toBe(true);
    expect(result.error).toContain('Auth failed');
    expect(sendMock()).not.toHaveBeenCalled();
  });
});
