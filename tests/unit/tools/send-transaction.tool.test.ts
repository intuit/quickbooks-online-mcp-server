import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { mockQuickbooksClient, mockQuickbooksClientClass, mockQuickBooksInstance, resetAllMocks } from '../../mocks/quickbooks.mock';

jest.unstable_mockModule('../../../src/clients/quickbooks-client', () => ({
  quickbooksClient: mockQuickbooksClient,
  QuickbooksClient: mockQuickbooksClientClass,
}));

const { SendInvoiceTool } = await import('../../../src/tools/send-invoice.tool');
const { SendEstimateTool } = await import('../../../src/tools/send-estimate.tool');
const { RegisterTool } = await import('../../../src/helpers/register-tool');

const cases = [
  {
    tool: SendInvoiceTool,
    idKey: 'invoice_id',
    noun: 'invoice',
    label: 'Invoice',
    getMock: () => mockQuickBooksInstance.getInvoice,
    sendMock: () => mockQuickBooksInstance.sendInvoicePdf,
  },
  {
    tool: SendEstimateTool,
    idKey: 'estimate_id',
    noun: 'estimate',
    label: 'Estimate',
    getMock: () => mockQuickBooksInstance.getEstimate,
    sendMock: () => mockQuickBooksInstance.sendEstimatePdf,
  },
];

describe.each(cases)('$tool.name', ({ tool, idKey, noun, label, getMock, sendMock }) => {
  const handler = (params: any) => (tool.handler as any)({ params });
  const unsent = { Id: '7', EmailStatus: 'NeedToSend', BillEmail: { Address: 'billing@example.com' } };

  beforeEach(() => {
    resetAllMocks();
  });

  afterEach(() => {
    delete process.env['QUICKBOOKS_DISABLE_WRITE'];
  });

  describe('description', () => {
    it('warns that it emails the customer and cannot be undone', () => {
      expect(tool.description).toMatch(/Email an? \w+ PDF to the customer/);
      expect(tool.description).toContain('CANNOT be undone');
      expect(tool.description).toContain('OVERWRITES');
    });
  });

  describe('schema', () => {
    it('accepts an id alone and defaults allow_resend to false', () => {
      const parsed = tool.schema.safeParse({ [idKey]: '7' });
      expect(parsed.success).toBe(true);
      expect((parsed as any).data.allow_resend).toBe(false);
    });

    it('accepts a valid send_to address', () => {
      expect(tool.schema.safeParse({ [idKey]: '7', send_to: 'ap@example.com' }).success).toBe(true);
    });

    it('rejects an invalid send_to address', () => {
      const parsed = tool.schema.safeParse({ [idKey]: '7', send_to: 'not-an-email' });
      expect(parsed.success).toBe(false);
      expect(JSON.stringify((parsed as any).error.issues)).toContain('send_to must be a valid email address');
    });

    it('rejects a missing id', () => {
      expect(tool.schema.safeParse({}).success).toBe(false);
    });

    it('rejects a non-numeric id (no path segments reach the QBO URL)', () => {
      expect(tool.schema.safeParse({ [idKey]: '7/../1' }).success).toBe(false);
      expect(tool.schema.safeParse({ [idKey]: '' }).success).toBe(false);
    });
  });

  describe('handler', () => {
    it('emails via the stored BillEmail when send_to is omitted', async () => {
      getMock().mockImplementation((_id: any, cb: any) => cb(null, unsent));
      sendMock().mockImplementation((_id: any, _to: any, cb: any) => cb(null, { ...unsent, EmailStatus: 'EmailSent' }));

      const result = await handler({ [idKey]: '7' });

      expect(sendMock()).toHaveBeenCalledWith('7', undefined, expect.any(Function));
      expect(result.content[0].text).toBe(`${label} 7 emailed:`);
      expect(JSON.parse(result.content[1].text).EmailStatus).toBe('EmailSent');
    });

    it('passes the send_to override through', async () => {
      getMock().mockImplementation((_id: any, cb: any) => cb(null, unsent));
      sendMock().mockImplementation((_id: any, _to: any, cb: any) => cb(null, { ...unsent, EmailStatus: 'EmailSent' }));

      await handler({ [idKey]: '7', send_to: 'ap@example.com' });

      expect(sendMock()).toHaveBeenCalledWith('7', 'ap%40example.com', expect.any(Function));
    });

    it('forwards allow_resend to the handler', async () => {
      getMock().mockImplementation((_id: any, cb: any) => cb(null, { ...unsent, EmailStatus: 'EmailSent' }));
      sendMock().mockImplementation((_id: any, _to: any, cb: any) => cb(null, unsent));

      await handler({ [idKey]: '7', allow_resend: true });

      expect(sendMock()).toHaveBeenCalledTimes(1);
    });

    it('reports a QBO error without claiming success', async () => {
      getMock().mockImplementation((_id: any, cb: any) => cb(null, unsent));
      sendMock().mockImplementation((_id: any, _to: any, cb: any) => cb(new Error('QBO fault'), null));

      const result = await handler({ [idKey]: '7' });

      expect(result.content).toHaveLength(1);
      expect(result.content[0].text).toBe(`Error sending ${noun} 7: Error: QBO fault`);
    });
  });

  describe('write-mode gating', () => {
    it('is not registered when QUICKBOOKS_DISABLE_WRITE=true', () => {
      process.env['QUICKBOOKS_DISABLE_WRITE'] = 'true';
      const server = { tool: jest.fn() } as unknown as McpServer;
      RegisterTool(server, tool as any);
      expect(server.tool).not.toHaveBeenCalled();
    });

    it('is registered when QUICKBOOKS_DISABLE_WRITE is unset', () => {
      const server = { tool: jest.fn() } as unknown as McpServer;
      RegisterTool(server, tool as any);
      expect(server.tool).toHaveBeenCalledTimes(1);
      expect((server.tool as jest.Mock).mock.calls[0][0]).toBe(tool.name);
    });
  });
});
