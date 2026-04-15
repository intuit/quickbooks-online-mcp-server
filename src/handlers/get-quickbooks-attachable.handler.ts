import { getQuickbooks } from "../clients/quickbooks-client.js";
import { ToolResponse } from "../types/tool-response.js";
import { formatError } from "../helpers/format-error.js";

export async function getQuickbooksAttachable(id: string): Promise<ToolResponse<any>> {
  try {
    const quickbooks = await getQuickbooks();
    return new Promise((resolve) => {
      (quickbooks as any).getAttachable(id, (err: any, attachable: any) => {
        if (err) resolve({ result: null, isError: true, error: formatError(err) });
        else resolve({ result: attachable, isError: false, error: null });
      });
    });
  } catch (error) {
    return { result: null, isError: true, error: formatError(error) };
  }
}
