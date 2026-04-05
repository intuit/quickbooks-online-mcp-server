/**
 * Standard response format for tool execution.
 * Wraps operation results with error handling metadata.
 * @template T - The type of the result data.
 */
export interface ToolResponse<T> {
  /** The operation result, or null if an error occurred. */
  result: T | null;
  /** Whether the operation encountered an error. */
  isError: boolean;
  /** Error message if an error occurred, otherwise null. */
  error: string | null;
}