import { QuickbooksClient } from "../clients/quickbooks-client.js";
import { ToolResponse } from "../types/tool-response.js";
import { formatError } from "../helpers/format-error.js";
import { inactivateEntity } from "../helpers/inactivate.js";

/**
 * Marks an employee inactive in QuickBooks Online (sparse update, Active: false).
 * Reversible in QuickBooks; never deletes the record.
 */
export async function deleteQuickbooksEmployee(id: string): Promise<ToolResponse<any>> {
  try {
    const quickbooks: any = await QuickbooksClient.getInstance();
    return inactivateEntity({
      label: "Employee",
      id,
      get: (i, cb) => quickbooks.getEmployee(i, cb),
      update: (p, cb) => quickbooks.updateEmployee(p, cb),
    });
  } catch (error) {
    return { result: null, isError: true, error: formatError(error) };
  }
}
