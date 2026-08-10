/**
 * Regression tests: query-layer type handling, attachables search ergonomics,
 * response shaping, deep links, tool-name aliases, and schema completeness.
 * Grounded in production defects observed during heavy live use.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { mockQuickbooksClient, mockQuickbooksClientClass, mockQuickBooksInstance, resetAllMocks } from '../../mocks/quickbooks.mock';

jest.unstable_mockModule('../../../src/clients/quickbooks-client', () => ({
  quickbooksClient: mockQuickbooksClient,
  QuickbooksClient: mockQuickbooksClientClass,
}));

const { searchQuickbooksAttachables, getQuickbooksEntityAttachments } = await import('../../../src/handlers/search-quickbooks-attachables.handler');
const { getQuickbooksGeneralLedger, flattenReportRows } = await import('../../../src/handlers/get-quickbooks-general-ledger.handler');
const { coerceCriterionTypes, searchCriterionValueSchema, shapeSearchResults } = await import('../../../src/helpers/build-quickbooks-search-criteria');
const { buildQboLink, injectQboLinkIntoContent, resetCompanyNameCache } = await import('../../../src/helpers/qbo-entity-link');
const { RegisterTool } = await import('../../../src/helpers/register-tool');
const { GetJournalEntryTool } = await import('../../../src/tools/get-journal-entry.tool');
const { CreateVendorTool } = await import('../../../src/tools/create-vendor.tool');
const { CreateAttachableTool } = await import('../../../src/tools/create-attachable.tool');
const { GetTransactionLinkTool } = await import('../../../src/tools/get-transaction-link.tool');
const { UpdateBillTool } = await import('../../../src/tools/update-bill.tool');

const capture = (mock: any) => (mock.mock.calls[0] as any)[0];

describe('Query layer and ergonomics', () => {
  beforeEach(() => {
    resetAllMocks();
    resetCompanyNameCache();
  });

  describe('criteria type handling', () => {
    it('schema accepts string, number, boolean, and array values natively', () => {
      for (const v of ['x', 42, true, ['a', 'b']]) {
        expect(() => searchCriterionValueSchema.parse(v)).not.toThrow();
      }
    });

    it('coerces boolean-strings on known boolean fields (Active) to real booleans', () => {
      const [c] = coerceCriterionTypes([{ field: 'Active', value: 'true' }]);
      expect(c.value).toBe(true); // "true" raw → QBO "String cannot be cast to Boolean"
    });

    it('leaves boolean-looking strings alone on non-boolean fields', () => {
      const [c] = coerceCriterionTypes([{ field: 'DisplayName', value: 'true' }]);
      expect(c.value).toBe('true');
    });

    it('parses a pre-built SQL tuple string for IN into an array', () => {
      const [c] = coerceCriterionTypes([{ field: 'Id', value: "('a','b')", operator: 'IN' }]);
      expect(c.value).toEqual(['a', 'b']); // raw tuple string → QueryParserError before
    });

    it('passes a native array for IN through untouched (node-quickbooks builds the tuple)', () => {
      const [c] = coerceCriterionTypes([{ field: 'Id', value: ['1', '2'], operator: 'IN' }]);
      expect(c.value).toEqual(['1', '2']);
    });
  });

  describe('attachables search + entity attachments', () => {
    it('defaults to newest-first ordering and forwards limit/offset/date filters', async () => {
      mockQuickBooksInstance.findAttachables.mockImplementation((criteria: any, cb: any) => cb(null, { QueryResponse: { Attachable: [] } }));
      await searchQuickbooksAttachables({ limit: 50, offset: 101, created_after: '2026-01-01' });
      const criteria = capture(mockQuickBooksInstance.findAttachables);
      expect(criteria).toContainEqual({ field: 'desc', value: 'MetaData.CreateTime' });
      expect(criteria).toContainEqual({ field: 'limit', value: 50 });
      expect(criteria).toContainEqual({ field: 'offset', value: 101 });
      expect(criteria).toContainEqual({ field: 'MetaData.CreateTime', value: '2026-01-01', operator: '>=' });
    });

    it('get_entity_attachments filters by AttachableRef server-side before returning', async () => {
      const atts = [
        { Id: 'a1', AttachableRef: [{ EntityRef: { type: 'Bill', value: '100' } }] },
        { Id: 'a2', AttachableRef: [{ EntityRef: { type: 'Bill', value: '999' } }] },
        { Id: 'a3', AttachableRef: [{ EntityRef: { type: 'Purchase', value: '100' } }] },
      ];
      mockQuickBooksInstance.findAttachables.mockImplementation((_c: any, cb: any) => cb(null, { QueryResponse: { Attachable: atts } }));
      const result = await getQuickbooksEntityAttachments({ entity_type: 'Bill', entity_id: '100' });
      expect(result.isError).toBe(false);
      expect(result.result.matches.map((m: any) => m.Id)).toEqual(['a1']);
    });
  });

  describe('response shaping', () => {
    it('summary mode compacts entities to identifying fields', () => {
      const shaped = shapeSearchResults(
        [{ Id: '1', DocNumber: 'B-1', VendorRef: { name: 'Acme Supply' }, TxnDate: '2026-01-31', TotalAmt: 113, Balance: 113, Line: [{ big: 'payload' }] }],
        { summary: true }
      );
      expect(shaped[0]).toEqual({ Id: '1', DocNumber: 'B-1', Name: undefined, VendorRef: 'Acme Supply', CustomerRef: undefined, TxnDate: '2026-01-31', TotalAmt: 113, Balance: 113 });
    });

    it('fields projection picks dot-paths', () => {
      const shaped = shapeSearchResults([{ Id: '1', VendorRef: { name: 'Acme', value: '41' } }], { fields: ['Id', 'VendorRef.name'] });
      expect(shaped[0]).toEqual({ Id: '1', 'VendorRef.name': 'Acme' });
    });

    it('get_general_ledger forwards account and source_account to the Reports API', async () => {
      mockQuickBooksInstance.reportGeneralLedgerDetail.mockImplementation((criteria: any, cb: any) => cb(null, { Rows: {} }));
      await getQuickbooksGeneralLedger({ account: '18', source_account: '35' });
      const criteria = capture(mockQuickBooksInstance.reportGeneralLedgerDetail);
      expect(criteria.account).toBe('18');
      expect(criteria.source_account).toBe('35');
    });

    it('flattens nested report rows into compact objects', () => {
      const report = {
        Columns: { Column: [{ ColTitle: 'Date' }, { ColTitle: 'Amount' }] },
        Rows: { Row: [{ Header: { ColData: [{ value: 'Accrued Liabilities' }] }, Rows: { Row: [{ ColData: [{ value: '2026-06-30' }, { value: '100.00' }] }] } }] },
      };
      const { rows } = flattenReportRows(report);
      expect(rows).toEqual([{ Date: '2026-06-30', Amount: '100.00', _section: 'Accrued Liabilities' }]);
    });
  });

  describe('transaction deep links', () => {
    it('get_transaction_link returns a company-prefixed deep link', async () => {
      mockQuickBooksInstance.getCompanyInfo.mockImplementation((_id: any, cb: any) => cb(null, { CompanyName: 'Testco Inc' }));
      const result = await (GetTransactionLinkTool.handler as any)({ params: { entity_type: 'bill', id: '100' } });
      expect(result.content[0].text).toContain('[Testco Inc] https://qbo.intuit.com/app/bill?txnId=100');
    });

    it('rejects unsupported entity types with the supported list', async () => {
      const result = await (GetTransactionLinkTool.handler as any)({ params: { entity_type: 'timesheet', id: '1' } });
      expect(result.content[0].text).toMatch(/unsupported entity_type/);
    });

    it('injects qbo_link into a create/update transaction JSON response', async () => {
      mockQuickBooksInstance.getCompanyInfo.mockImplementation((_id: any, cb: any) => cb(null, { CompanyName: 'Testco Inc' }));
      const content = [
        { type: 'text', text: 'created:' },
        { type: 'text', text: JSON.stringify({ Id: '99', DocNumber: 'B-1' }) },
      ];
      await injectQboLinkIntoContent('create-bill', content as any);
      expect(JSON.parse(content[1].text!).qbo_link).toBe('[Testco Inc] https://qbo.intuit.com/app/bill?txnId=99');
    });

    it('leaves non-transaction tools without a link', async () => {
      const content = [{ type: 'text', text: JSON.stringify({ Id: '7' }) }];
      await injectQboLinkIntoContent('create-vendor', content as any);
      expect(JSON.parse(content[0].text!).qbo_link).toBeUndefined();
    });
  });

  describe('tool-name aliases', () => {
    it('registers create_bill alongside create-bill (hyphen name kept for compat)', () => {
      const registered: string[] = [];
      const fakeServer = { tool: (name: string) => registered.push(name) } as any;
      RegisterTool(fakeServer, UpdateBillTool as any);
      expect(registered).toEqual(['update-bill', 'update_bill']);
    });

    it('does not alias underscore-named tools', () => {
      const registered: string[] = [];
      const fakeServer = { tool: (name: string) => registered.push(name) } as any;
      RegisterTool(fakeServer, GetJournalEntryTool as any);
      expect(registered).toEqual(['get_journal_entry']);
    });
  });

  describe('envelope tolerance and schema completeness', () => {
    it('get_journal_entry accepts params.id and the journal_entry_id alias', async () => {
      mockQuickBooksInstance.getJournalEntry.mockImplementation((id: any, cb: any) => cb(null, { Id: id }));
      await (GetJournalEntryTool.handler as any)({ params: { id: '7' } });
      await (GetJournalEntryTool.handler as any)({ params: { journal_entry_id: '9' } });
      expect(mockQuickBooksInstance.getJournalEntry.mock.calls.map((c: any) => c[0])).toEqual(['7', '9']);
    });

    it('create-vendor keeps CurrencyRef (immutable after first use), TermRef, TaxIdentifier, Vendor1099', () => {
      const parsed = (CreateVendorTool.schema as any).parse({
        vendor: { DisplayName: 'ACME', CurrencyRef: { value: 'USD' }, TermRef: { value: '3' }, TaxIdentifier: '123456789', Vendor1099: true },
      });
      expect(parsed.vendor.CurrencyRef).toEqual({ value: 'USD' });
      expect(parsed.vendor.Vendor1099).toBe(true);
    });

    it('create_attachable strips TempDownloadUri by default and keeps it on request', async () => {
      mockQuickBooksInstance.createAttachable.mockImplementation((p: any, cb: any) =>
        cb(null, { Id: '1', FileName: 'x.pdf', TempDownloadUri: 'https://long-presigned-url/blob' })
      );
      const stripped = await (CreateAttachableTool.handler as any)({ params: { file_name: 'x.pdf' } });
      expect(stripped.content[1].text).not.toContain('TempDownloadUri');
      resetAllMocks();
      mockQuickBooksInstance.createAttachable.mockImplementation((p: any, cb: any) =>
        cb(null, { Id: '1', FileName: 'x.pdf', TempDownloadUri: 'https://long-presigned-url/blob' })
      );
      const kept = await (CreateAttachableTool.handler as any)({ params: { file_name: 'x.pdf', return_download_uri: true } });
      expect(kept.content[1].text).toContain('TempDownloadUri');
    });
  });
});
