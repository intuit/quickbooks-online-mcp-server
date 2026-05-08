import { describe, it, expect } from '@jest/globals';
import { buildQuickbooksSearchCriteria } from '../../../src/helpers/build-quickbooks-search-criteria';

describe('buildQuickbooksSearchCriteria – Fixes #13', () => {
  it('should pass through a simple criteria object', () => {
    const input = { Name: 'Foo' };
    expect(buildQuickbooksSearchCriteria(input)).toEqual(input);
  });

  it('should pass through an array as-is', () => {
    const input = [{ field: 'Name', value: 'Foo', operator: '=' }];
    expect(buildQuickbooksSearchCriteria(input)).toEqual(input);
  });

  it('should convert advanced options with filters', () => {
    const input = {
      filters: [{ field: 'TxnDate', value: '2026-01-01', operator: '>=' }],
      limit: 10,
      asc: 'TxnDate',
    };
    const result = buildQuickbooksSearchCriteria(input) as Array<Record<string, any>>;

    expect(Array.isArray(result)).toBe(true);
    expect(result).toContainEqual({ field: 'TxnDate', value: '2026-01-01', operator: '>=' });
    expect(result).toContainEqual({ field: 'asc', value: 'TxnDate' });
    expect(result).toContainEqual({ field: 'limit', value: 10 });
  });

  it('should accept "criteria" as an alias for "filters" and not drop them', () => {
    // This is the exact scenario from issue #13: criteria + pagination params
    const input = {
      criteria: [{ field: 'TxnDate', value: '2026-01-01', operator: '>=' }],
      limit: 10,
      asc: 'TxnDate',
    };
    const result = buildQuickbooksSearchCriteria(input) as Array<Record<string, any>>;

    expect(Array.isArray(result)).toBe(true);
    // The filter must NOT be silently dropped
    expect(result).toContainEqual({ field: 'TxnDate', value: '2026-01-01', operator: '>=' });
    expect(result).toContainEqual({ field: 'asc', value: 'TxnDate' });
    expect(result).toContainEqual({ field: 'limit', value: 10 });
  });

  it('should prefer "filters" over "criteria" if both are provided', () => {
    const input = {
      filters: [{ field: 'Name', value: 'A', operator: '=' }],
      criteria: [{ field: 'Name', value: 'B', operator: '=' }],
    };
    const result = buildQuickbooksSearchCriteria(input) as Array<Record<string, any>>;

    expect(result).toContainEqual({ field: 'Name', value: 'A', operator: '=' });
    expect(result).not.toContainEqual({ field: 'Name', value: 'B', operator: '=' });
  });

  it('should handle desc, offset, count, and fetchAll options', () => {
    const input = { desc: 'MetaData.CreateTime', offset: 5, count: true, fetchAll: true };
    const result = buildQuickbooksSearchCriteria(input) as Array<Record<string, any>>;

    expect(result).toContainEqual({ field: 'desc', value: 'MetaData.CreateTime' });
    expect(result).toContainEqual({ field: 'offset', value: 5 });
    expect(result).toContainEqual({ field: 'count', value: true });
    expect(result).toContainEqual({ field: 'fetchAll', value: true });
  });

  it('should return empty object when advanced options are all empty', () => {
    const input = { filters: [] };
    const result = buildQuickbooksSearchCriteria(input);
    expect(result).toEqual({});
  });

  it('should pass through null/undefined as a simple criteria object', () => {
    // Not advanced, so returned as-is per the pass-through logic
    expect(buildQuickbooksSearchCriteria(null as any)).toBeNull();
    expect(buildQuickbooksSearchCriteria(undefined as any)).toBeUndefined();
  });
});
