import { ToolResponse } from "../types/tool-response.js";
import { formatError } from "./format-error.js";
import { promisify } from "./confirm-flow.js";

/**
 * Marks a name-list entity inactive: fetch it for the current SyncToken, then
 * send a sparse update of only Id, SyncToken and Active:false. Reversible in
 * QuickBooks, so there is no confirmation step. Never calls a delete function.
 */
export async function inactivateEntity(opts: {
  label: string;
  id: string;
  get: (id: string, cb: (err: any, res: any) => void) => void;
  update: (payload: any, cb: (err: any, res: any) => void) => void;
}): Promise<ToolResponse<any>> {
  try {
    const record = await promisify((cb) => opts.get(opts.id, cb));
    if (!record || record.Id === undefined || record.Id === null) {
      return { result: null, isError: true, error: `${opts.label} ${opts.id} not found` };
    }
    const payload = { Id: record.Id, SyncToken: record.SyncToken, Active: false, sparse: true };
    const result = await promisify((cb) => opts.update(payload, cb));
    return { result, isError: false, error: null };
  } catch (error) {
    return { result: null, isError: true, error: formatError(error) };
  }
}
