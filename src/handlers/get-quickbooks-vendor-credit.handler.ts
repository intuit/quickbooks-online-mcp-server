import { getQuickbooks } from "../clients/quickbooks-client.js";
import { ToolResponse } from "../types/tool-response.js";
import { formatError } from "../helpers/format-error.js";

export async function getQuickbooksVendorCredit(id: string): Promise<ToolResponse<any>> {
  try {
    const quickbooks = await getQuickbooks();
    return new Promise((resolve) => {
      (quickbooks as any).getVendorCredit(id, (err: any, vc: any) => {
        if (err) resolve({ result: null, isError: true, error: formatError(err) });
        else resolve({ result: vc, isError: false, error: null });
      });
    });
  } catch (error) {
    return { result: null, isError: true, error: formatError(error) };
  }
}
