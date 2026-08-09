import { resolveRefreshToken } from '../../../src/clients/token-sidecar';

describe('resolveRefreshToken', () => {
  it('uses the configured token when no sidecar exists', () => {
    const result = resolveRefreshToken('host-token', '12345', null);
    expect(result).toEqual({ refreshToken: 'host-token', realmId: '12345', chainRoot: 'host-token' });
  });

  it('trusts the sidecar when its chain root matches the configured token', () => {
    const sidecar = { refreshToken: 'rotated-token', realmId: '99999', descendedFrom: 'host-token', updatedAt: '2026-08-01T00:00:00.000Z' };
    const result = resolveRefreshToken('host-token', '12345', sidecar);
    expect(result).toEqual({ refreshToken: 'rotated-token', realmId: '99999', chainRoot: 'host-token' });
  });

  it('falls back to the sidecar realmId only when the sidecar itself omits one', () => {
    const sidecar = { refreshToken: 'rotated-token', descendedFrom: 'host-token', updatedAt: '2026-08-01T00:00:00.000Z' };
    const result = resolveRefreshToken('host-token', '12345', sidecar);
    expect(result.realmId).toBe('12345');
  });

  it('ignores a stale sidecar when the configured token has changed (manual re-auth)', () => {
    const sidecar = { refreshToken: 'rotated-token', realmId: '99999', descendedFrom: 'old-host-token', updatedAt: '2026-08-01T00:00:00.000Z' };
    const result = resolveRefreshToken('new-host-token', '12345', sidecar);
    expect(result).toEqual({ refreshToken: 'new-host-token', realmId: '12345', chainRoot: 'new-host-token' });
  });

  it('does not trust a sidecar when there is no configured token to compare against', () => {
    const sidecar = { refreshToken: 'rotated-token', realmId: '99999', descendedFrom: 'host-token', updatedAt: '2026-08-01T00:00:00.000Z' };
    const result = resolveRefreshToken(undefined, undefined, sidecar);
    expect(result).toEqual({ refreshToken: undefined, realmId: undefined, chainRoot: undefined });
  });

  it('handles no configured token and no sidecar (fresh OAuth needed)', () => {
    const result = resolveRefreshToken(undefined, undefined, null);
    expect(result).toEqual({ refreshToken: undefined, realmId: undefined, chainRoot: undefined });
  });
});
