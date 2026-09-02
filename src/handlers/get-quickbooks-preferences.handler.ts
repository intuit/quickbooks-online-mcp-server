import { QuickbooksClient } from "../clients/quickbooks-client.js";
import { formatError } from "../helpers/format-error.js";
import { ToolResponse } from "../types/tool-response.js";

export async function getQuickbooksPreferences(): Promise<ToolResponse<any>> {
  try {
    const quickbooks = await QuickbooksClient.getInstance();

    return new Promise((resolve) => {
      (quickbooks as any).getPreferences((err: any, preferences: any) => {
        if (err) resolve({ result: null, isError: true, error: formatError(err) });
        else resolve({ result: preferences, isError: false, error: null });
      });
    });
  } catch (error) {
    return { result: null, isError: true, error: formatError(error) };
  }
}
