import { getQuickbooks } from "../clients/quickbooks-client.js";
import { ToolResponse } from "../types/tool-response.js";
import { formatError } from "../helpers/format-error.js";

export interface SearchAttachablesInput {
  file_name?: string;
  content_type?: string;
  limit?: number;
}

export async function searchQuickbooksAttachables(data: SearchAttachablesInput): Promise<ToolResponse<any>> {
  try {
    const quickbooks = await getQuickbooks();
    const criteria: Record<string, any> = {};
    if (data.file_name) criteria.FileName = data.file_name;
    if (data.content_type) criteria.ContentType = data.content_type;
    if (data.limit) criteria.limit = data.limit;

    return new Promise((resolve) => {
      (quickbooks as any).findAttachables(criteria, (err: any, result: any) => {
        if (err) resolve({ result: null, isError: true, error: formatError(err) });
        else resolve({ result: result?.QueryResponse?.Attachable || [], isError: false, error: null });
      });
    });
  } catch (error) {
    return { result: null, isError: true, error: formatError(error) };
  }
}
