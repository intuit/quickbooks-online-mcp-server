import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { mockQuickbooksClient, mockQuickbooksClientClass, mockQuickBooksInstance, resetAllMocks } from '../../mocks/quickbooks.mock';

// The tool modules import their handlers, which import the quickbooks-client.
// Mock the client so importing the tool doesn't spin up real auth/config.
jest.unstable_mockModule('../../../src/clients/quickbooks-client', () => ({
  quickbooksClient: mockQuickbooksClient,
  QuickbooksClient: mockQuickbooksClientClass,
}));

const { CreateJournalEntryTool } = await import('../../../src/tools/create-journal-entry.tool');
const { UpdateJournalEntryTool } = await import('../../../src/tools/update-journal-entry.tool');

// A single balanced debit/credit pair, reused across tests.
const balancedLines = [
  {
    Amount: 100,
    DetailType: 'JournalEntryLineDetail' as const,
    JournalEntryLineDetail: { PostingType: 'Debit' as const, AccountRef: { value: '1' } },
  },
  {
    Amount: 100,
    DetailType: 'JournalEntryLineDetail' as const,
    JournalEntryLineDetail: { PostingType: 'Credit' as const, AccountRef: { value: '2' } },
  },
];

describe('create_journal_entry schema', () => {
  it('accepts a balanced entry', () => {
    const result = CreateJournalEntryTool.schema.safeParse({
      journalEntry: { TxnDate: '2026-07-14', Line: balancedLines },
    });
    expect(result.success).toBe(true);
  });

  it('passes through valid QBO fields not modeled in the schema', () => {
    const result = CreateJournalEntryTool.schema.safeParse({
      journalEntry: {
        TxnDate: '2026-07-14',
        CurrencyRef: { value: 'USD' }, // unmodeled top-level field
        Line: [
          {
            ...balancedLines[0],
            // unmodeled nested field on JournalEntryLineDetail (A/R posting)
            JournalEntryLineDetail: {
              ...balancedLines[0].JournalEntryLineDetail,
              Entity: { Type: 'Customer', EntityRef: { value: '9' } },
            },
          },
          balancedLines[1],
        ],
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      const je = result.data.journalEntry as Record<string, any>;
      expect(je.CurrencyRef).toEqual({ value: 'USD' });
      expect(je.Line[0].JournalEntryLineDetail.Entity).toEqual({
        Type: 'Customer',
        EntityRef: { value: '9' },
      });
    }
  });

  it('accepts a Line-level Description (correct placement)', () => {
    const result = CreateJournalEntryTool.schema.safeParse({
      journalEntry: {
        TxnDate: '2026-07-14',
        Line: balancedLines.map((l) => ({ ...l, Description: 'line memo' })),
      },
    });
    expect(result.success).toBe(true);
  });
});

describe('update_journal_entry schema', () => {
  it('accepts a sparse update with no Line array', () => {
    const result = UpdateJournalEntryTool.schema.safeParse({
      journal_entry_id: '5',
      patch: { SyncToken: '0', sparse: true, PrivateNote: 'memo only' },
    });
    expect(result.success).toBe(true);
  });

  it('accepts an update with lines', () => {
    const result = UpdateJournalEntryTool.schema.safeParse({
      journal_entry_id: '5',
      patch: { SyncToken: '0', Line: balancedLines },
    });
    expect(result.success).toBe(true);
  });
});

// Exercise the tool handlers (success + error branches) so the handler code in
// the tool modules is covered now that the tool files are imported here.
// The handler's typed signature is the MCP ToolCallback (args, extra); the
// implementation ignores `extra`, so we invoke it as a plain function here.
const createHandler = CreateJournalEntryTool.handler as (args: any) => Promise<any>;
const updateHandler = UpdateJournalEntryTool.handler as (args: any) => Promise<any>;

describe('journal entry tool handlers', () => {
  beforeEach(() => {
    resetAllMocks();
  });

  it('create handler returns the created entry on success', async () => {
    const created = { Id: '10', TxnDate: '2026-07-14' };
    mockQuickBooksInstance.createJournalEntry.mockImplementation((_p: any, cb: any) => cb(null, created));

    const result = await createHandler({ params: { journalEntry: { Line: balancedLines } } });

    expect(result.content[0].text).toContain('Journal entry created');
    expect(result.content[1].text).toContain('"Id":"10"');
  });

  it('create handler returns an error message on failure', async () => {
    mockQuickBooksInstance.createJournalEntry.mockImplementation((_p: any, cb: any) => cb(new Error('boom')));

    const result = await createHandler({ params: { journalEntry: { Line: balancedLines } } });

    expect(result.content[0].text).toContain('Error creating journal entry');
  });

  it('update handler returns the updated entry on success', async () => {
    const updated = { Id: '5', SyncToken: '1' };
    mockQuickBooksInstance.getJournalEntry.mockImplementation((_id: any, cb: any) => cb(null, { Id: '5', SyncToken: '0' }));
    mockQuickBooksInstance.updateJournalEntry.mockImplementation((_p: any, cb: any) => cb(null, updated));

    const result = await updateHandler({ params: { journal_entry_id: '5', patch: {} } });

    expect(result.content[0].text).toContain('Journal entry updated');
    expect(result.content[1].text).toContain('"SyncToken":"1"');
  });

  it('update handler returns an error message on failure', async () => {
    mockQuickBooksInstance.getJournalEntry.mockImplementation((_id: any, cb: any) => cb(null, { Id: '5', SyncToken: '0' }));
    mockQuickBooksInstance.updateJournalEntry.mockImplementation((_p: any, cb: any) => cb(new Error('boom')));

    const result = await updateHandler({ params: { journal_entry_id: '5', patch: {} } });

    expect(result.content[0].text).toContain('Error updating journal entry');
  });

  // Covers the handler's outer catch block: getInstance() itself throwing (e.g. auth
  // failure) rather than the QBO callback returning an error.
  it('create handler surfaces an error when getInstance rejects', async () => {
    (mockQuickbooksClientClass.getInstance as any).mockRejectedValue(new Error('Auth failed'));

    const result = await createHandler({ params: { journalEntry: { Line: balancedLines } } });

    expect(result.content[0].text).toContain('Error creating journal entry');
    expect(result.content[0].text).toContain('Auth failed');
  });

  it('update handler surfaces an error when getInstance rejects', async () => {
    (mockQuickbooksClientClass.getInstance as any).mockRejectedValue(new Error('Auth failed'));

    const result = await updateHandler({ params: { journal_entry_id: '5', patch: {} } });

    expect(result.content[0].text).toContain('Error updating journal entry');
    expect(result.content[0].text).toContain('Auth failed');
  });
});
