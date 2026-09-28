import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { mockQuickbooksClient, mockQuickbooksClientClass, mockQuickBooksInstance, resetAllMocks } from '../../mocks/quickbooks.mock';

// The tool modules import their handlers, which import the quickbooks-client.
// Mock the client so importing the tool doesn't spin up real auth/config.
jest.unstable_mockModule('../../../src/clients/quickbooks-client', () => ({
  quickbooksClient: mockQuickbooksClient,
  QuickbooksClient: mockQuickbooksClientClass,
}));

const { GetTransactionListTool } = await import('../../../src/tools/get-transaction-list.tool');

describe('get_transaction_list schema', () => {
  it('rejects params without start_date', () => {
    const result = GetTransactionListTool.schema.safeParse({ vendor: '176' });
    expect(result.success).toBe(false);
  });

  it('accepts start_date with vendor filter', () => {
    const result = GetTransactionListTool.schema.safeParse({
      start_date: '2026-01-01',
      vendor: '176',
    });
    expect(result.success).toBe(true);
  });
});

// Exercise the tool handler (success + error branches) so the handler code in
// the tool module is covered. The handler's typed signature is the MCP
// ToolCallback (args, extra); the implementation ignores `extra`, so we invoke
// it as a plain function here.
const getTransactionListHandler = GetTransactionListTool.handler as (args: any) => Promise<any>;

describe('get_transaction_list handler', () => {
  beforeEach(() => {
    resetAllMocks();
  });

  it('returns the formatted report on success', async () => {
    const report = { ReportHeader: { Name: 'TransactionList' }, Rows: { Row: [] } };
    mockQuickBooksInstance.reportTransactionList.mockImplementation((_p: any, cb: any) => cb(null, report));

    const result = await getTransactionListHandler({ params: { start_date: '2026-01-01', vendor: '176' } });

    expect(result.content[0].text).toBe('Transaction List Report:');
    expect(result.content[1].text).toBe(JSON.stringify(report, null, 2));
    expect(mockQuickBooksInstance.reportTransactionList).toHaveBeenCalledWith(
      { start_date: '2026-01-01', vendor: '176' },
      expect.any(Function),
    );
  });

  it('returns an error message when the report call fails', async () => {
    mockQuickBooksInstance.reportTransactionList.mockImplementation((_p: any, cb: any) => cb(new Error('boom')));

    const result = await getTransactionListHandler({ params: { start_date: '2026-01-01' } });

    expect(result.content).toHaveLength(1);
    expect(result.content[0].text).toContain('Error:');
    expect(result.content[0].text).toContain('boom');
  });
});
