import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { mockQuickbooksClient, mockQuickbooksClientClass, mockQuickBooksInstance, resetAllMocks } from '../../mocks/quickbooks.mock';

// ESM-compatible module mocking
jest.unstable_mockModule('../../../src/clients/quickbooks-client', () => ({
  quickbooksClient: mockQuickbooksClient,
  QuickbooksClient: mockQuickbooksClientClass,
}));

// Mock https for binary upload tests
const mockHttpsRequest = jest.fn();
jest.unstable_mockModule('https', () => ({
  default: { request: mockHttpsRequest },
  request: mockHttpsRequest,
}));

function mockHttpsUploadResponse(statusCode: number, responseBody: unknown) {
  const mockReq = { write: jest.fn(), end: jest.fn(), on: jest.fn() };
  (mockHttpsRequest as any).mockImplementation((_options: unknown, callback: (res: unknown) => void) => {
    const mockRes = {
      statusCode,
      on: jest.fn((event: string, handler: (...args: unknown[]) => void) => {
        if (event === 'data') {
          const payload = typeof responseBody === 'string' ? responseBody : JSON.stringify(responseBody);
          handler(Buffer.from(payload));
        } else if (event === 'end') {
          handler();
        }
      }),
    };
    callback(mockRes);
    return mockReq;
  });
}

function mockHttpsUploadNetworkError(err: Error) {
  const mockReq = {
    write: jest.fn(),
    end: jest.fn(),
    on: jest.fn((event: string, handler: (...args: unknown[]) => void) => {
      if (event === 'error') handler(err);
    }),
  };
  (mockHttpsRequest as any).mockImplementation((_options: unknown, _callback: unknown) => mockReq);
}

// Dynamic imports after mock setup
const { getQuickbooksCompanyInfo } = await import('../../../src/handlers/get-quickbooks-company-info.handler');
const { updateQuickbooksCompanyInfo } = await import('../../../src/handlers/update-quickbooks-company-info.handler');
const { createQuickbooksAttachable } = await import('../../../src/handlers/create-quickbooks-attachable.handler');
const { getQuickbooksAttachable } = await import('../../../src/handlers/get-quickbooks-attachable.handler');
const { updateQuickbooksAttachable } = await import('../../../src/handlers/update-quickbooks-attachable.handler');
const { deleteQuickbooksAttachable } = await import('../../../src/handlers/delete-quickbooks-attachable.handler');
const { searchQuickbooksAttachables } = await import('../../../src/handlers/search-quickbooks-attachables.handler');

describe('Company and Attachable Handlers', () => {
  beforeEach(() => {
    resetAllMocks();
  });

  describe('getQuickbooksCompanyInfo', () => {
    it('should get company info', async () => {
      const mockInfo = { Id: '1', CompanyName: 'Test Company' };
      mockQuickBooksInstance.getCompanyInfo.mockImplementation((_id: any, cb: any) => cb(null, mockInfo));
      (mockQuickBooksInstance as any).realmId = '123456';

      const result = await getQuickbooksCompanyInfo();

      expect(result.isError).toBe(false);
      expect(result.result).toEqual(mockInfo);
    });

    it('should get company info with specific ID', async () => {
      const mockInfo = { Id: '2', CompanyName: 'Another Company' };
      mockQuickBooksInstance.getCompanyInfo.mockImplementation((_id: any, cb: any) => cb(null, mockInfo));

      const result = await getQuickbooksCompanyInfo('specific-id');

      expect(result.isError).toBe(false);
    });

    it('should handle errors', async () => {
      mockQuickBooksInstance.getCompanyInfo.mockImplementation((_id: any, cb: any) =>
        cb(new Error('Not authorized'), null)
      );

      const result = await getQuickbooksCompanyInfo();

      expect(result.isError).toBe(true);
    });
  });

  describe('updateQuickbooksCompanyInfo', () => {
    it('should update company info', async () => {
      const mockUpdated = { Id: '1', CompanyName: 'Updated Company' };
      mockQuickBooksInstance.updateCompanyInfo.mockImplementation((payload: any, cb: any) => cb(null, mockUpdated));

      const result = await updateQuickbooksCompanyInfo({
        id: '1',
        sync_token: '0',
        company_name: 'Updated Company'
      });

      expect(result.isError).toBe(false);
    });

    it('should update with all fields', async () => {
      mockQuickBooksInstance.updateCompanyInfo.mockImplementation((payload: any, cb: any) => cb(null, {}));

      const result = await updateQuickbooksCompanyInfo({
        id: '1',
        sync_token: '0',
        company_name: 'Test',
        legal_name: 'Test LLC',
        company_addr: {
          line1: '123 Main St',
          city: 'Anytown',
          country_sub_division_code: 'CA',
          postal_code: '12345',
          country: 'USA'
        },
        primary_phone: '555-1234',
        email: 'test@test.com',
        web_addr: 'https://test.com'
      });

      expect(result.isError).toBe(false);
    });

    it('should update with partial company_addr fields', async () => {
      mockQuickBooksInstance.updateCompanyInfo.mockImplementation((payload: any, cb: any) => cb(null, {}));

      const result = await updateQuickbooksCompanyInfo({
        id: '1',
        sync_token: '0',
        company_addr: {
          line1: '456 Oak Ave'
        }
      });

      expect(result.isError).toBe(false);
    });

    it('should update with only city in company_addr', async () => {
      mockQuickBooksInstance.updateCompanyInfo.mockImplementation((payload: any, cb: any) => cb(null, {}));

      const result = await updateQuickbooksCompanyInfo({
        id: '1',
        sync_token: '0',
        company_addr: {
          city: 'Los Angeles'
        }
      });

      expect(result.isError).toBe(false);
    });

    it('should handle API errors', async () => {
      mockQuickBooksInstance.updateCompanyInfo.mockImplementation((payload: any, cb: any) =>
        cb(new Error('Update failed'), null)
      );

      const result = await updateQuickbooksCompanyInfo({ id: '1', sync_token: '0' });

      expect(result.isError).toBe(true);
    });

    it('should handle authentication errors', async () => {
      (mockQuickbooksClientClass.getInstance as any).mockRejectedValue(new Error('Auth failed'));

      const result = await updateQuickbooksCompanyInfo({ id: '1', sync_token: '0' });

      expect(result.isError).toBe(true);
      expect(result.error).toContain('Auth failed');
    });
  });

  describe('getQuickbooksCompanyInfo auth errors', () => {
    it('should handle authentication errors', async () => {
      (mockQuickbooksClientClass.getInstance as any).mockRejectedValue(new Error('Auth failed'));

      const result = await getQuickbooksCompanyInfo();

      expect(result.isError).toBe(true);
      expect(result.error).toContain('Auth failed');
    });
  });

  describe('createQuickbooksAttachable', () => {
    it('should create an attachable', async () => {
      const mockAttachable = { Id: '1', FileName: 'test.pdf' };
      mockQuickBooksInstance.createAttachable.mockImplementation((payload: any, cb: any) => cb(null, mockAttachable));

      const result = await createQuickbooksAttachable({ file_name: 'test.pdf' });

      expect(result.isError).toBe(false);
      expect(result.result).toEqual(mockAttachable);
    });

    it('should create with all fields', async () => {
      mockQuickBooksInstance.createAttachable.mockImplementation((payload: any, cb: any) => cb(null, {}));

      const result = await createQuickbooksAttachable({
        file_name: 'invoice.pdf',
        note: 'Invoice attachment',
        category: 'Invoice',
        content_type: 'application/pdf',
        attachable_ref: { entity_ref_type: 'Invoice', entity_ref_value: '123' }
      });

      expect(result.isError).toBe(false);
    });

    it('should handle API errors', async () => {
      mockQuickBooksInstance.createAttachable.mockImplementation((payload: any, cb: any) =>
        cb(new Error('Create failed'), null)
      );

      const result = await createQuickbooksAttachable({ file_name: 'test.pdf' });

      expect(result.isError).toBe(true);
    });

    it('should handle authentication errors', async () => {
      (mockQuickbooksClientClass.getInstance as any).mockRejectedValue(new Error('Auth failed'));

      const result = await createQuickbooksAttachable({ file_name: 'test.pdf' });

      expect(result.isError).toBe(true);
      expect(result.error).toContain('Auth failed');
    });

    it('should propagate IncludeOnSend through attachable_ref', async () => {
      let capturedPayload: any = null;
      mockQuickBooksInstance.createAttachable.mockImplementation((payload: any, cb: any) => {
        capturedPayload = payload;
        cb(null, { Id: '1' });
      });

      const result = await createQuickbooksAttachable({
        file_name: 'invoice.pdf',
        attachable_ref: {
          entity_ref_type: 'Invoice',
          entity_ref_value: '42',
          include_on_send: true,
        },
      });

      expect(result.isError).toBe(false);
      expect(capturedPayload.AttachableRef[0].IncludeOnSend).toBe(true);
      expect(capturedPayload.AttachableRef[0].EntityRef).toEqual({ type: 'Invoice', value: '42' });
    });
  });

  describe('createQuickbooksAttachable — binary upload', () => {
    it('should upload PDF when base64_content is provided', async () => {
      const uploadResponse = {
        AttachableResponse: [
          { Attachable: { Id: '99', FileName: 'invoice.pdf' }, responseStatus: '200' },
        ],
      };
      mockHttpsUploadResponse(200, uploadResponse);

      const result = await createQuickbooksAttachable({
        file_name: 'invoice.pdf',
        content_type: 'application/pdf',
        base64_content: Buffer.from('fake-pdf-bytes').toString('base64'),
        attachable_ref: { entity_ref_type: 'Bill', entity_ref_value: '123' },
      });

      expect(result.isError).toBe(false);
      expect(result.result).toEqual(uploadResponse);
      expect(mockHttpsRequest).toHaveBeenCalledTimes(1);
      const [[reqOptions]] = (mockHttpsRequest as jest.Mock).mock.calls as any[][];
      expect(reqOptions.method).toBe('POST');
      expect(reqOptions.path).toBe('/v3/company/mock-realm-id/upload');
      expect(reqOptions.hostname).toBe('sandbox-quickbooks.api.intuit.com');
      expect(reqOptions.headers.Authorization).toBe('Bearer mock-access-token');
    });

    it('should select production host when isSandbox is false', async () => {
      const { mockAuthCredentials } = await import('../../mocks/quickbooks.mock');
      (mockQuickbooksClientClass.getAuthCredentials as any).mockResolvedValue({
        ...mockAuthCredentials,
        isSandbox: false,
      });
      mockHttpsUploadResponse(200, { AttachableResponse: [] });

      await createQuickbooksAttachable({
        file_name: 'doc.pdf',
        content_type: 'application/pdf',
        base64_content: Buffer.from('x').toString('base64'),
      });

      const [[reqOptions]] = (mockHttpsRequest as jest.Mock).mock.calls as any[][];
      expect(reqOptions.hostname).toBe('quickbooks.api.intuit.com');
    });

    it('should reject unsupported content_type before any upload', async () => {
      const result = await createQuickbooksAttachable({
        file_name: 'sketch.psd',
        content_type: 'image/vnd.adobe.photoshop',
        base64_content: Buffer.from('x').toString('base64'),
      });

      expect(result.isError).toBe(true);
      expect(result.error).toContain('Unsupported content_type');
      expect(mockHttpsRequest).not.toHaveBeenCalled();
    });

    it('should reject missing content_type before any upload', async () => {
      const result = await createQuickbooksAttachable({
        file_name: 'unknown.bin',
        base64_content: Buffer.from('x').toString('base64'),
      });

      expect(result.isError).toBe(true);
      expect(result.error).toContain('Unsupported content_type');
      expect(mockHttpsRequest).not.toHaveBeenCalled();
    });

    it('should accept all 16 documented QBO MIME types', async () => {
      const supportedTypes = [
        'application/postscript',
        'text/csv',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'image/gif',
        'image/jpeg',
        'image/jpg',
        'application/vnd.oasis.opendocument.spreadsheet',
        'application/pdf',
        'image/png',
        'text/rtf',
        'image/tif',
        'text/plain',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'text/xml',
      ];

      for (const ct of supportedTypes) {
        mockHttpsUploadResponse(200, { AttachableResponse: [] });
        const result = await createQuickbooksAttachable({
          file_name: `file-${ct.replace(/[^a-z0-9]/gi, '-')}`,
          content_type: ct,
          base64_content: Buffer.from('x').toString('base64'),
        });
        expect(result.isError).toBe(false);
      }
    });

    it('should reject base64_content exceeding 100 MB before decoding', async () => {
      // Construct a base64 string whose approximate decoded size is > 100 MB
      // without actually allocating 100 MB of bytes. base64 length ~ size * 4/3.
      const overLimitBase64Length = Math.ceil(((100 * 1024 * 1024) + 1) * 4 / 3);
      const oversized = 'A'.repeat(overLimitBase64Length);

      const result = await createQuickbooksAttachable({
        file_name: 'huge.pdf',
        content_type: 'application/pdf',
        base64_content: oversized,
      });

      expect(result.isError).toBe(true);
      expect(result.error).toContain('File too large');
      expect(mockHttpsRequest).not.toHaveBeenCalled();
    });

    it('should redact QBO response body on HTTP 4xx error', async () => {
      const sensitiveBody = JSON.stringify({
        Fault: {
          Error: [{ Detail: 'realm 9341454900 trace=abc123 user=foo@bar.com' }],
        },
      });
      mockHttpsUploadResponse(401, sensitiveBody);

      const result = await createQuickbooksAttachable({
        file_name: 'doc.pdf',
        content_type: 'application/pdf',
        base64_content: Buffer.from('x').toString('base64'),
      });

      expect(result.isError).toBe(true);
      expect(result.error).toContain('401');
      expect(result.error).toContain('authentication or authorization error');
      // The raw QBO body must NOT appear in the returned error.
      expect(result.error).not.toContain('9341454900');
      expect(result.error).not.toContain('trace=abc123');
      expect(result.error).not.toContain('foo@bar.com');
    });

    it('should label HTTP 413 as payload too large', async () => {
      mockHttpsUploadResponse(413, 'realm 9341454900 says request too big');

      const result = await createQuickbooksAttachable({
        file_name: 'doc.pdf',
        content_type: 'application/pdf',
        base64_content: Buffer.from('x').toString('base64'),
      });

      expect(result.isError).toBe(true);
      expect(result.error).toContain('413');
      expect(result.error).toContain('payload too large');
      expect(result.error).not.toContain('9341454900');
    });

    it('should label generic HTTP 4xx as client error', async () => {
      mockHttpsUploadResponse(400, 'realm 9341454900 bad request detail');

      const result = await createQuickbooksAttachable({
        file_name: 'doc.pdf',
        content_type: 'application/pdf',
        base64_content: Buffer.from('x').toString('base64'),
      });

      expect(result.isError).toBe(true);
      expect(result.error).toContain('400');
      expect(result.error).toContain('client error');
      expect(result.error).not.toContain('9341454900');
    });

    it('should redact QBO response body on HTTP 5xx error', async () => {
      mockHttpsUploadResponse(503, 'internal trace 7f8a9b: realm 9341454900');

      const result = await createQuickbooksAttachable({
        file_name: 'doc.pdf',
        content_type: 'application/pdf',
        base64_content: Buffer.from('x').toString('base64'),
      });

      expect(result.isError).toBe(true);
      expect(result.error).toContain('503');
      expect(result.error).toContain('QBO server error');
      expect(result.error).not.toContain('9341454900');
      expect(result.error).not.toContain('trace 7f8a9b');
    });

    it('should redact network errors as generic message', async () => {
      mockHttpsUploadNetworkError(new Error('ECONNREFUSED 10.0.0.1:443'));

      const result = await createQuickbooksAttachable({
        file_name: 'doc.pdf',
        content_type: 'application/pdf',
        base64_content: Buffer.from('x').toString('base64'),
      });

      expect(result.isError).toBe(true);
      expect(result.error).toContain('network error');
      // Internal IP must not leak into the caller-facing error.
      expect(result.error).not.toContain('10.0.0.1');
    });

    it('should reject when QBO returns 200 with non-JSON body', async () => {
      mockHttpsUploadResponse(200, '<html>not json</html>');

      const result = await createQuickbooksAttachable({
        file_name: 'doc.pdf',
        content_type: 'application/pdf',
        base64_content: Buffer.from('x').toString('base64'),
      });

      expect(result.isError).toBe(true);
      expect(result.error).toMatch(/QBO upload failed/);
    });

    it('should not call /upload when base64_content is omitted (metadata-only path)', async () => {
      mockQuickBooksInstance.createAttachable.mockImplementation((_payload: any, cb: any) =>
        cb(null, { Id: '1', FileName: 'metadata-only.pdf' })
      );

      const result = await createQuickbooksAttachable({ file_name: 'metadata-only.pdf' });

      expect(result.isError).toBe(false);
      expect(mockHttpsRequest).not.toHaveBeenCalled();
    });
  });

  describe('getQuickbooksAttachable', () => {
    it('should get an attachable by ID', async () => {
      const mockAttachable = { Id: '1', FileName: 'test.pdf' };
      mockQuickBooksInstance.getAttachable.mockImplementation((_id: any, cb: any) => cb(null, mockAttachable));

      const result = await getQuickbooksAttachable('1');

      expect(result.isError).toBe(false);
    });

    it('should handle API errors', async () => {
      mockQuickBooksInstance.getAttachable.mockImplementation((_id: any, cb: any) =>
        cb(new Error('Not found'), null)
      );

      const result = await getQuickbooksAttachable('999');

      expect(result.isError).toBe(true);
    });

    it('should handle authentication errors', async () => {
      (mockQuickbooksClientClass.getInstance as any).mockRejectedValue(new Error('Auth failed'));

      const result = await getQuickbooksAttachable('1');

      expect(result.isError).toBe(true);
      expect(result.error).toContain('Auth failed');
    });
  });

  describe('updateQuickbooksAttachable', () => {
    it('should update an attachable', async () => {
      mockQuickBooksInstance.updateAttachable.mockImplementation((payload: any, cb: any) => cb(null, {}));

      const result = await updateQuickbooksAttachable({
        id: '1',
        sync_token: '0',
        file_name: 'updated.pdf',
        note: 'Updated note',
        category: 'Updated'
      });

      expect(result.isError).toBe(false);
    });

    it('should handle API errors', async () => {
      mockQuickBooksInstance.updateAttachable.mockImplementation((payload: any, cb: any) =>
        cb(new Error('Update failed'), null)
      );

      const result = await updateQuickbooksAttachable({ id: '1', sync_token: '0' });

      expect(result.isError).toBe(true);
    });

    it('should handle authentication errors', async () => {
      (mockQuickbooksClientClass.getInstance as any).mockRejectedValue(new Error('Auth failed'));

      const result = await updateQuickbooksAttachable({ id: '1', sync_token: '0' });

      expect(result.isError).toBe(true);
      expect(result.error).toContain('Auth failed');
    });
  });

  describe('deleteQuickbooksAttachable', () => {
    it('should delete an attachable', async () => {
      mockQuickBooksInstance.deleteAttachable.mockImplementation((payload: any, cb: any) => cb(null, {}));

      const result = await deleteQuickbooksAttachable({ id: '1', sync_token: '0' });

      expect(result.isError).toBe(false);
    });

    it('should handle API errors', async () => {
      mockQuickBooksInstance.deleteAttachable.mockImplementation((payload: any, cb: any) =>
        cb(new Error('Delete failed'), null)
      );

      const result = await deleteQuickbooksAttachable({ id: '1', sync_token: '0' });

      expect(result.isError).toBe(true);
    });

    it('should handle authentication errors', async () => {
      (mockQuickbooksClientClass.getInstance as any).mockRejectedValue(new Error('Auth failed'));

      const result = await deleteQuickbooksAttachable({ id: '1', sync_token: '0' });

      expect(result.isError).toBe(true);
      expect(result.error).toContain('Auth failed');
    });
  });

  describe('searchQuickbooksAttachables', () => {
    it('should search attachables', async () => {
      const mockAttachables = [{ Id: '1', FileName: 'test.pdf' }];
      mockQuickBooksInstance.findAttachables.mockImplementation((criteria: any, cb: any) =>
        cb(null, { QueryResponse: { Attachable: mockAttachables } })
      );

      const result = await searchQuickbooksAttachables({});

      expect(result.isError).toBe(false);
      expect(result.result).toEqual(mockAttachables);
    });

    it('should search with filters', async () => {
      mockQuickBooksInstance.findAttachables.mockImplementation((criteria: any, cb: any) =>
        cb(null, { QueryResponse: { Attachable: [] } })
      );

      const result = await searchQuickbooksAttachables({
        file_name: 'test',
        content_type: 'application/pdf',
        limit: 10
      });

      expect(result.isError).toBe(false);
    });

    it('should handle API errors', async () => {
      mockQuickBooksInstance.findAttachables.mockImplementation((criteria: any, cb: any) =>
        cb(new Error('Search failed'), null)
      );

      const result = await searchQuickbooksAttachables({});

      expect(result.isError).toBe(true);
    });

    it('should handle authentication errors', async () => {
      (mockQuickbooksClientClass.getInstance as any).mockRejectedValue(new Error('Auth failed'));

      const result = await searchQuickbooksAttachables({});

      expect(result.isError).toBe(true);
      expect(result.error).toContain('Auth failed');
    });

    it('should handle empty QueryResponse', async () => {
      mockQuickBooksInstance.findAttachables.mockImplementation((criteria: any, cb: any) =>
        cb(null, { QueryResponse: {} })
      );

      const result = await searchQuickbooksAttachables({ limit: 5 });

      expect(result.isError).toBe(false);
      expect(result.result).toEqual([]);
    });
  });
});


