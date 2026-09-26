import { formatError } from '../../../src/helpers/format-error';

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

  describe('QuickBooks fault details', () => {
    const axiosLikeError = (fault: unknown) => {
      const error = new Error('Request failed with status code 400');
      (error as any).response = { status: 400, data: { Fault: fault } };
      return error;
    };

    it('should append the QBO fault message and detail', () => {
      const error = axiosLikeError({
        Error: [{ Message: 'Invalid query', Detail: "QueryValidationError: property 'EntityRef' is not queryable", code: '4001' }],
      });

      expect(formatError(error)).toBe(
        "Error: Request failed with status code 400 | QuickBooks: Invalid query: QueryValidationError: property 'EntityRef' is not queryable"
      );
    });

    it('should join multiple fault entries with a semicolon', () => {
      const error = axiosLikeError({
        Error: [
          { Message: 'Invalid query', Detail: 'first problem' },
          { Message: 'Bad value' },
        ],
      });

      expect(formatError(error)).toBe(
        'Error: Request failed with status code 400 | QuickBooks: Invalid query: first problem; Bad value'
      );
    });

    it('should fall back to the fault message when Detail is missing', () => {
      const error = axiosLikeError({ Error: [{ Message: 'Bad request' }] });

      expect(formatError(error)).toBe('Error: Request failed with status code 400 | QuickBooks: Bad request');
    });

    it('should label fault entries missing a message as Unknown fault', () => {
      const error = axiosLikeError({ Error: [{ Detail: 'detail only' }] });

      expect(formatError(error)).toBe(
        'Error: Request failed with status code 400 | QuickBooks: Unknown fault: detail only'
      );
    });

    it('should ignore fault entries that yield no text', () => {
      const error = axiosLikeError({ Error: [{}, { Message: '' }] });

      expect(formatError(error)).toBe('Error: Request failed with status code 400');
    });

    it('should not append anything when the body has no Fault array', () => {
      const error = axiosLikeError({ Error: 'not-an-array' });
      const noFault = new Error('boom');
      (noFault as any).response = { status: 500, data: { other: true } };

      expect(formatError(error)).toBe('Error: Request failed with status code 400');
      expect(formatError(noFault)).toBe('Error: boom');
    });
  });
});
