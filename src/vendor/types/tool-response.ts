export interface ToolResponse<T> {
    result: T | null;
    isError: boolean;
    error: string | null;
  }