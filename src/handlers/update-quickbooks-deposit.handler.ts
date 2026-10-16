import { QuickbooksClient } from "../clients/quickbooks-client.js";
import { ToolResponse } from "../types/tool-response.js";
import { formatError } from "../helpers/format-error.js";

export interface UpdateDepositInput {
  id: string;
  sync_token: string;
  private_note?: string;
  lines?: UpdateDepositLineInput[];
}

export interface UpdateDepositLineInput {
  line_id: string;
  account_ref?: string;
  description?: string;
}

function fail(error: string): ToolResponse<any> {
  return { result: null, isError: true, error };
}

// Checks the requested line edits against the fetched deposit and returns an
// error message, or null when every edit can be applied.
function validateLineEdits(lines: UpdateDepositLineInput[], current: any): string | null {
  const seen = new Set<string>();
  for (const edit of lines) {
    if (seen.has(edit.line_id)) return `Duplicate line_id "${edit.line_id}" in lines`;
    seen.add(edit.line_id);
    if (!edit.account_ref && edit.description === undefined) {
      return `Line "${edit.line_id}" needs account_ref or description`;
    }
    const line = (current.Line ?? []).find((l: any) => String(l.Id) === String(edit.line_id));
    if (!line) return `Deposit ${current.Id} has no line with Id "${edit.line_id}"`;
    if (edit.account_ref && (line.DetailType !== "DepositLineDetail" || !line.DepositLineDetail)) {
      return `Line "${edit.line_id}" is not a DepositLineDetail line, so its account cannot be changed`;
    }
    // A line linked to a payment or sales receipt is booked through that transaction;
    // re-pointing its account would break the link.
    if (edit.account_ref && line.LinkedTxn?.length) {
      return `Line "${edit.line_id}" is linked to another transaction, so its account cannot be changed`;
    }
  }
  return null;
}

export async function updateQuickbooksDeposit(data: UpdateDepositInput): Promise<ToolResponse<any>> {
  try {
    if (!data.private_note && !data.lines?.length) {
      return fail("Nothing to update: provide private_note and/or lines");
    }

    const quickbooks = await QuickbooksClient.getInstance();

    // QBO rejects a sparse Deposit update that omits DepositToAccountRef (and
    // other required fields) — unlike Purchase, sparse=true isn't honored here.
    // Fetch the current record and send a full object back instead.
    const current: any = await new Promise((resolve, reject) => {
      (quickbooks as any).getDeposit(data.id, (err: any, deposit: any) => {
        if (err) reject(err); else resolve(deposit);
      });
    });

    const lineError = data.lines ? validateLineEdits(data.lines, current) : null;
    if (lineError) return fail(lineError);

    const payload: any = { ...current, SyncToken: data.sync_token };
    if (data.lines?.length) {
      const edits = new Map(data.lines.map((edit) => [String(edit.line_id), edit]));
      // validateLineEdits guarantees Line exists once any edit matched.
      payload.Line = current.Line.map((line: any) => {
        const edit = edits.get(String(line.Id));
        if (!edit) return line;
        const updated = { ...line };
        if (edit.description !== undefined) updated.Description = edit.description;
        // The stale account name is dropped so QBO resolves it from the new id.
        if (edit.account_ref) {
          updated.DepositLineDetail = { ...line.DepositLineDetail, AccountRef: { value: edit.account_ref } };
        }
        return updated;
      });
    }
    if (data.private_note) payload.PrivateNote = data.private_note;

    return new Promise((resolve) => {
      (quickbooks as any).updateDeposit(payload, (err: any, updated: any) => {
        if (err) resolve({ result: null, isError: true, error: formatError(err) });
        else resolve({ result: updated, isError: false, error: null });
      });
    });
  } catch (error) {
    return { result: null, isError: true, error: formatError(error) };
  }
}

