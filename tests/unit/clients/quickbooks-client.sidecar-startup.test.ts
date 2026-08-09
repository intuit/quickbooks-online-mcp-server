import { jest } from '@jest/globals';

process.env.QUICKBOOKS_CLIENT_ID = 'test-client-id';
process.env.QUICKBOOKS_CLIENT_SECRET = 'test-client-secret';
process.env.QUICKBOOKS_REFRESH_TOKEN = 'host-token';
process.env.QUICKBOOKS_REALM_ID = '12345';
process.env.QUICKBOOKS_ENVIRONMENT = 'sandbox';
process.env.QUICKBOOKS_REDIRECT_URI = 'http://localhost:8000/callback';

const sidecarContent = JSON.stringify({
  refreshToken: 'rotated-from-sidecar',
  realmId: '99999',
  descendedFrom: 'host-token',
  updatedAt: '2026-08-01T00:00:00.000Z',
});

jest.unstable_mockModule('fs', () => ({
  default: {
    readFileSync: jest.fn(() => sidecarContent),
    existsSync: jest.fn(() => true),
    writeFileSync: jest.fn(),
    renameSync: jest.fn(),
    unlinkSync: jest.fn(),
    mkdirSync: jest.fn(),
    lstatSync: jest.fn(() => ({ isSymbolicLink: () => false })),
  },
}));

jest.unstable_mockModule('intuit-oauth', () => {
  class MockOAuthClient {
    static scopes = { Accounting: 'com.intuit.quickbooks.accounting' };
    refreshUsingToken = jest.fn();
    createToken = jest.fn();
    authorizeUri = jest.fn(() => 'https://mock');
    constructor(_cfg: Record<string, unknown>) {}
  }
  return { default: MockOAuthClient };
});

jest.unstable_mockModule('node-quickbooks', () => ({
  default: class MockQuickBooks { constructor(..._args: unknown[]) {} },
}));

jest.unstable_mockModule('open', () => ({ default: jest.fn(async () => undefined) }));

jest.unstable_mockModule('http', () => ({
  default: { createServer: jest.fn(() => ({ listen: jest.fn(), close: jest.fn(), on: jest.fn(), address: jest.fn() })) },
}));

const { quickbooksClient } = await import('../../../src/clients/quickbooks-client');

describe('QuickbooksClient startup sidecar resolution', () => {
  it('uses the trusted sidecar refresh token instead of the raw configured env value', () => {
    expect((quickbooksClient as unknown as { refreshToken?: string }).refreshToken).toBe('rotated-from-sidecar');
  });

  it('uses the sidecar realmId when the chain is trusted', () => {
    expect((quickbooksClient as unknown as { realmId?: string }).realmId).toBe('99999');
  });

  it('sets tokenChainRoot to the descendedFrom value from the trusted sidecar', () => {
    expect((quickbooksClient as unknown as { tokenChainRoot?: string }).tokenChainRoot).toBe('host-token');
  });
});
