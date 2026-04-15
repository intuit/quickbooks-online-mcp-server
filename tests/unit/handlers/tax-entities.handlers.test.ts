import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { mockGetQuickbooks, mockQuickBooksInstance, resetAllMocks } from '../../mocks/quickbooks.mock';

// ESM-compatible module mocking
jest.unstable_mockModule('../../../src/clients/quickbooks-client', () => ({
  getQuickbooks: mockGetQuickbooks,
}));

// Dynamic imports after mock setup
const { getQuickbooksTaxCode } = await import('../../../src/handlers/get-quickbooks-tax-code.handler');
const { searchQuickbooksTaxCodes } = await import('../../../src/handlers/search-quickbooks-tax-codes.handler');
const { getQuickbooksTaxRate } = await import('../../../src/handlers/get-quickbooks-tax-rate.handler');
const { searchQuickbooksTaxRates } = await import('../../../src/handlers/search-quickbooks-tax-rates.handler');
const { getQuickbooksTaxAgency } = await import('../../../src/handlers/get-quickbooks-tax-agency.handler');
const { searchQuickbooksTaxAgencies } = await import('../../../src/handlers/search-quickbooks-tax-agencies.handler');

describe('Tax Entity Handlers', () => {
  beforeEach(() => {
    resetAllMocks();
  });

  describe('getQuickbooksTaxCode', () => {
    it('should get a tax code by ID', async () => {
      const mockTaxCode = { Id: '1', Name: 'TAX' };
      mockQuickBooksInstance.getTaxCode.mockImplementation((_id: any, cb: any) => cb(null, mockTaxCode));

      const result = await getQuickbooksTaxCode('1');

      expect(result.isError).toBe(false);
      expect(result.result).toEqual(mockTaxCode);
    });

    it('should handle errors', async () => {
      mockQuickBooksInstance.getTaxCode.mockImplementation((_id: any, cb: any) =>
        cb(new Error('Not found'), null)
      );

      const result = await getQuickbooksTaxCode('999');

      expect(result.isError).toBe(true);
    });
  });

  describe('searchQuickbooksTaxCodes', () => {
    it('should search tax codes', async () => {
      const mockTaxCodes = [{ Id: '1', Name: 'TAX' }];
      mockQuickBooksInstance.findTaxCodes.mockImplementation((criteria: any, cb: any) =>
        cb(null, { QueryResponse: { TaxCode: mockTaxCodes } })
      );

      const result = await searchQuickbooksTaxCodes({});

      expect(result.isError).toBe(false);
      expect(result.result).toEqual(mockTaxCodes);
    });

    it('should search with filters', async () => {
      mockQuickBooksInstance.findTaxCodes.mockImplementation((criteria: any, cb: any) =>
        cb(null, { QueryResponse: { TaxCode: [] } })
      );

      const result = await searchQuickbooksTaxCodes({ name: 'TAX', active: true, taxable: true, limit: 10 });

      expect(result.isError).toBe(false);
    });

    it('should handle API errors', async () => {
      mockQuickBooksInstance.findTaxCodes.mockImplementation((criteria: any, cb: any) =>
        cb(new Error('Search failed'), null)
      );

      const result = await searchQuickbooksTaxCodes({});

      expect(result.isError).toBe(true);
    });

    it('should handle authentication errors', async () => {
      (mockGetQuickbooks as any).mockRejectedValue(new Error('Auth failed'));

      const result = await searchQuickbooksTaxCodes({});

      expect(result.isError).toBe(true);
      expect(result.error).toContain('Auth failed');
    });

    it('should handle empty QueryResponse', async () => {
      mockQuickBooksInstance.findTaxCodes.mockImplementation((criteria: any, cb: any) =>
        cb(null, { QueryResponse: {} })
      );

      const result = await searchQuickbooksTaxCodes({ limit: 5 });

      expect(result.isError).toBe(false);
      expect(result.result).toEqual([]);
    });
  });

  describe('getQuickbooksTaxCode auth tests', () => {
    it('should handle authentication errors', async () => {
      (mockGetQuickbooks as any).mockRejectedValue(new Error('Auth failed'));

      const result = await getQuickbooksTaxCode('1');

      expect(result.isError).toBe(true);
      expect(result.error).toContain('Auth failed');
    });
  });

  describe('getQuickbooksTaxRate', () => {
    it('should get a tax rate by ID', async () => {
      const mockTaxRate = { Id: '1', RateValue: 8.25 };
      mockQuickBooksInstance.getTaxRate.mockImplementation((_id: any, cb: any) => cb(null, mockTaxRate));

      const result = await getQuickbooksTaxRate('1');

      expect(result.isError).toBe(false);
      expect(result.result).toEqual(mockTaxRate);
    });

    it('should handle API errors', async () => {
      mockQuickBooksInstance.getTaxRate.mockImplementation((_id: any, cb: any) =>
        cb(new Error('Not found'), null)
      );

      const result = await getQuickbooksTaxRate('999');

      expect(result.isError).toBe(true);
    });

    it('should handle authentication errors', async () => {
      (mockGetQuickbooks as any).mockRejectedValue(new Error('Auth failed'));

      const result = await getQuickbooksTaxRate('1');

      expect(result.isError).toBe(true);
      expect(result.error).toContain('Auth failed');
    });
  });

  describe('searchQuickbooksTaxRates', () => {
    it('should search tax rates', async () => {
      const mockTaxRates = [{ Id: '1', RateValue: 8.25 }];
      mockQuickBooksInstance.findTaxRates.mockImplementation((criteria: any, cb: any) =>
        cb(null, { QueryResponse: { TaxRate: mockTaxRates } })
      );

      const result = await searchQuickbooksTaxRates({});

      expect(result.isError).toBe(false);
      expect(result.result).toEqual(mockTaxRates);
    });

    it('should search with all filter options', async () => {
      mockQuickBooksInstance.findTaxRates.mockImplementation((criteria: any, cb: any) =>
        cb(null, { QueryResponse: { TaxRate: [] } })
      );

      const result = await searchQuickbooksTaxRates({ name: 'Sales Tax', active: true, limit: 10 });

      expect(result.isError).toBe(false);
    });

    it('should handle API errors', async () => {
      mockQuickBooksInstance.findTaxRates.mockImplementation((criteria: any, cb: any) =>
        cb(new Error('Search failed'), null)
      );

      const result = await searchQuickbooksTaxRates({});

      expect(result.isError).toBe(true);
    });

    it('should handle authentication errors', async () => {
      (mockGetQuickbooks as any).mockRejectedValue(new Error('Auth failed'));

      const result = await searchQuickbooksTaxRates({});

      expect(result.isError).toBe(true);
      expect(result.error).toContain('Auth failed');
    });

    it('should handle empty QueryResponse', async () => {
      mockQuickBooksInstance.findTaxRates.mockImplementation((criteria: any, cb: any) =>
        cb(null, { QueryResponse: {} })
      );

      const result = await searchQuickbooksTaxRates({ limit: 5 });

      expect(result.isError).toBe(false);
      expect(result.result).toEqual([]);
    });
  });

  describe('getQuickbooksTaxAgency', () => {
    it('should get a tax agency by ID', async () => {
      const mockTaxAgency = { Id: '1', DisplayName: 'State Tax Agency' };
      mockQuickBooksInstance.getTaxAgency.mockImplementation((_id: any, cb: any) => cb(null, mockTaxAgency));

      const result = await getQuickbooksTaxAgency('1');

      expect(result.isError).toBe(false);
      expect(result.result).toEqual(mockTaxAgency);
    });

    it('should handle API errors', async () => {
      mockQuickBooksInstance.getTaxAgency.mockImplementation((_id: any, cb: any) =>
        cb(new Error('Not found'), null)
      );

      const result = await getQuickbooksTaxAgency('999');

      expect(result.isError).toBe(true);
    });

    it('should handle authentication errors', async () => {
      (mockGetQuickbooks as any).mockRejectedValue(new Error('Auth failed'));

      const result = await getQuickbooksTaxAgency('1');

      expect(result.isError).toBe(true);
      expect(result.error).toContain('Auth failed');
    });
  });

  describe('searchQuickbooksTaxAgencies', () => {
    it('should search tax agencies', async () => {
      const mockAgencies = [{ Id: '1', DisplayName: 'State Tax Agency' }];
      mockQuickBooksInstance.findTaxAgencies.mockImplementation((criteria: any, cb: any) =>
        cb(null, { QueryResponse: { TaxAgency: mockAgencies } })
      );

      const result = await searchQuickbooksTaxAgencies({});

      expect(result.isError).toBe(false);
      expect(result.result).toEqual(mockAgencies);
    });

    it('should search with name filter', async () => {
      mockQuickBooksInstance.findTaxAgencies.mockImplementation((criteria: any, cb: any) =>
        cb(null, { QueryResponse: { TaxAgency: [] } })
      );

      const result = await searchQuickbooksTaxAgencies({ name: 'State', limit: 5 });

      expect(result.isError).toBe(false);
    });

    it('should search with only limit filter', async () => {
      mockQuickBooksInstance.findTaxAgencies.mockImplementation((criteria: any, cb: any) =>
        cb(null, { QueryResponse: {} })
      );

      const result = await searchQuickbooksTaxAgencies({ limit: 10 });

      expect(result.isError).toBe(false);
      expect(result.result).toEqual([]);
    });

    it('should handle API errors', async () => {
      mockQuickBooksInstance.findTaxAgencies.mockImplementation((criteria: any, cb: any) =>
        cb(new Error('Search failed'), null)
      );

      const result = await searchQuickbooksTaxAgencies({});

      expect(result.isError).toBe(true);
    });

    it('should handle authentication errors', async () => {
      (mockGetQuickbooks as any).mockRejectedValue(new Error('Auth failed'));

      const result = await searchQuickbooksTaxAgencies({});

      expect(result.isError).toBe(true);
      expect(result.error).toContain('Auth failed');
    });
  });
});
