import { describe, it, expect } from '@jest/globals';
import { cleanPatch, buildSparsePayload } from '../../../src/helpers/sparse-patch';

describe('cleanPatch', () => {
  it('removes void and sparse keys in any case and keeps everything else', () => {
    const out = cleanPatch({ void: true, Void: 'true', VOID: 1, sparse: false, Sparse: true, Name: 'x', Line: [] });
    expect(out).toEqual({ Name: 'x', Line: [] });
  });
});

describe('buildSparsePayload', () => {
  it('uses only the fetched SyncToken, the patch, the id and sparse:true', () => {
    const p = buildSparsePayload('5', { SyncToken: '2', SSN: 'XXX' }, { A: 1, Id: '9', sparse: false, void: true });
    expect(p).toEqual({ Id: '5', SyncToken: '2', A: 1, sparse: true });
  });
  it('lets a caller SyncToken win', () => {
    expect(buildSparsePayload('5', { SyncToken: '2' }, { SyncToken: '8' }).SyncToken).toBe('8');
  });
});
