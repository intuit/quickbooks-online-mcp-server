import { formatError, sanitizeError } from '../../../src/helpers/format-error';

describe('formatError', () => {
  it('should format Error instances', () => {
    const error = new Error('Something went wrong');
    expect(formatError(error)).toBe('Error: Something went wrong');
  });

  it('should format string errors', () => {
    expect(formatError('A string error')).toBe('Error: A string error');
  });

  it('should format unknown error types', () => {
    const unknownError = { code: 500, message: 'Server error' };
    expect(formatError(unknownError)).toBe(
      'Unknown error: {"code":500,"message":"Server error"}'
    );
  });

  it('should handle null errors', () => {
    expect(formatError(null)).toBe('Unknown error: null');
  });

  it('should handle undefined errors', () => {
    expect(formatError(undefined)).toBe('Unknown error: undefined');
  });

  it('should handle number errors', () => {
    expect(formatError(404)).toBe('Unknown error: 404');
  });

  it('appends a QuickBooks validation fault from the axios response body', () => {
    const error = Object.assign(new Error('Request failed with status code 400'), {
      response: { data: { Fault: { Error: [{
        Message: 'Invalid Reference Id',
        Detail: 'Invalid Reference Id : Klasses element id 999999 not found',
        code: '2500',
        element: 'Reference Id',
      }], type: 'ValidationFault' } } },
    });

    const formatted = formatError(error);
    expect(formatted).toContain('Klasses element id 999999 not found');
    expect(formatted).toContain('code: 2500');
    expect(formatted).toContain('element: Reference Id');
  });

  it('names the offending field path for a bad ref value', () => {
    const error = Object.assign(new Error('Request failed with status code 400'), {
      response: { data: { Fault: { Error: [{
        Message: 'Invalid ID',
        Detail: 'Id should be a valid number. Supplied value:Field Services',
        code: '2030',
        element: 'Line.SalesItemLineDetail.ClassRef.value',
      }] } } },
    });

    expect(formatError(error)).toContain('Line.SalesItemLineDetail.ClassRef.value');
  });

  it('joins multiple faults', () => {
    const error = Object.assign(new Error('Request failed with status code 400'), {
      response: { data: { Fault: { Error: [
        { Detail: 'First problem', code: '1' },
        { Detail: 'Second problem', code: '2' },
      ] } } },
    });

    const formatted = formatError(error);
    expect(formatted).toContain('First problem');
    expect(formatted).toContain('Second problem');
  });

  it('falls back to Message when Detail is absent', () => {
    const error = Object.assign(new Error('boom'), {
      response: { data: { Fault: { Error: [{ Message: 'Only a message' }] } } },
    });

    expect(formatError(error)).toContain('Only a message');
  });

  it('leaves a plain Error untouched when there is no fault', () => {
    expect(formatError(new Error('Something went wrong'))).toBe('Error: Something went wrong');
  });

  it('formats a bare object that carries a fault', () => {
    const raw = { Fault: { Error: [{ Detail: 'Object-shaped fault' }] } };
    expect(formatError(raw)).toBe('Error: Object-shaped fault');
  });

  it('reads a fault from a lowercase fault/error body', () => {
    const raw = { data: { fault: { error: [{ Detail: 'Lowercase fault' }] } } };
    expect(formatError(raw)).toContain('Lowercase fault');
  });

  describe('sanitizeError', () => {
    it('drops the request body and auth headers but keeps the endpoint for debugging', () => {
      const error = {
        code: 'ERR_BAD_REQUEST',
        config: {
          data: '{"CustomerRef":{"value":"5270"},"PrivateNote":"confidential"}',
          headers: { Authorization: 'Bearer supersecrettoken' },
          url: 'https://quickbooks.api.intuit.com/v3/company/123/refundreceipt',
        },
        request: { _header: 'POST /v3/... Authorization: Bearer supersecrettoken' },
      };

      const formatted = formatError(error);
      expect(formatted).not.toContain('supersecrettoken');
      expect(formatted).not.toContain('confidential');
      expect(formatted).not.toContain('CustomerRef');
      expect(formatted).toContain('ERR_BAD_REQUEST');
      // the model driving the server still needs to know which call failed
      expect(formatted).toContain('/v3/company/123/refundreceipt');
    });

    it('keeps method and endpoint, strips the query string', () => {
      const sanitized: any = sanitizeError({
        config: {
          method: 'post',
          url: 'https://quickbooks.api.intuit.com/v3/company/123/query?query=select%20*%20from%20Customer&token=leak',
          data: '{"secret":"body"}',
          headers: { Authorization: 'Bearer nope' },
        },
      });

      expect(sanitized.config.method).toBe('POST');
      expect(sanitized.config.url).toBe('https://quickbooks.api.intuit.com/v3/company/123/query');
      expect(sanitized.config.url).not.toContain('token=leak');
      expect(sanitized.config.data).toBeUndefined();
      expect(sanitized.config.headers).toBeUndefined();
    });

    it('falls back to baseURL and omits config when it carries nothing useful', () => {
      const withBase: any = sanitizeError({ config: { baseURL: 'https://sandbox.api.intuit.com/v3' } });
      expect(withBase.config.url).toBe('https://sandbox.api.intuit.com/v3');

      const empty: any = sanitizeError({ config: { data: 'only a body' } });
      expect(empty.config).toBeUndefined();

      const notAnObject: any = sanitizeError({ config: 'not-an-object' });
      expect(notAnObject.config).toBeUndefined();
    });

    it('redacts sensitive keys wherever they appear', () => {
      const sanitized: any = sanitizeError({
        client_secret: 'shhh',
        refresh_token: 'rotate-me',
        nested: { accessToken: 'abc', authorization: 'Bearer x', keep: 'visible' },
      });

      expect(sanitized.client_secret).toBe('[redacted]');
      expect(sanitized.refresh_token).toBe('[redacted]');
      expect(sanitized.nested.accessToken).toBe('[redacted]');
      expect(sanitized.nested.authorization).toBe('[redacted]');
      expect(sanitized.nested.keep).toBe('visible');
    });

    it('breaks circular references instead of throwing', () => {
      const circular: any = { name: 'root' };
      circular.self = circular;

      expect(() => formatError(circular)).not.toThrow();
      expect(formatError(circular)).toContain('circular');
    });

    it('preserves the QBO fault while sanitizing the rest', () => {
      const error = {
        response: { data: { Fault: { Error: [{ Detail: 'Invalid Reference Id : Klasses element id 999 not found', code: '2500' }] } } },
        config: { headers: { Authorization: 'Bearer leak' } },
      };

      const formatted = formatError(error);
      expect(formatted).toContain('Klasses element id 999 not found');
      expect(formatted).not.toContain('leak');
    });

    it('caps long strings and large arrays', () => {
      const sanitized: any = sanitizeError({
        long: 'x'.repeat(900),
        many: Array.from({ length: 50 }, (_, i) => i),
      });

      expect(sanitized.long).toContain('[truncated]');
      expect(sanitized.long.length).toBeLessThan(600);
      expect(sanitized.many.length).toBe(21);
      expect(sanitized.many[20]).toContain('30 more');
    });

    it('stops at the depth limit', () => {
      const sanitized: any = sanitizeError({ a: { b: { c: { d: { e: 'too deep' } } } } });
      expect(JSON.stringify(sanitized)).toContain('[truncated]');
    });

    it('passes through primitives and small arrays untouched', () => {
      const sanitized: any = sanitizeError({
        bool: true,
        num: 42,
        sym: Symbol('nope'),
        few: [1, 2, 3],
        nothing: null,
      });

      expect(sanitized.bool).toBe(true);
      expect(sanitized.num).toBe(42);
      expect(sanitized.sym).toBeUndefined();
      expect(sanitized.few).toEqual([1, 2, 3]);
      expect(sanitized.nothing).toBeNull();
    });

    it('renders a fault that has only a code, and one with neither text nor code', () => {
      const onlyCode = { Fault: { Error: [{ code: '404' }] } };
      expect(formatError(onlyCode)).toContain('code: 404');

      const empty = { Fault: { Error: [{}] } };
      expect(formatError(empty)).toContain('Unknown error');
    });

    it('reads a fault nested under data without a response wrapper', () => {
      const error = { data: { Fault: { Error: [{ Detail: 'Nested under data' }] } } };
      expect(formatError(error)).toContain('Nested under data');
    });

    it('lifts name and message off Error values and drops functions', () => {
      const sanitized: any = sanitizeError({ inner: Object.assign(new Error('inner boom'), { fn: () => 1, big: 10n }) });
      expect(sanitized.inner.name).toBe('Error');
      expect(sanitized.inner.message).toBe('inner boom');
      expect(sanitized.inner.fn).toBeUndefined();
      expect(sanitized.inner.big).toBe('10');
    });
  });
});
