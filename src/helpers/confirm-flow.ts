import { ToolResponse } from "../types/tool-response.js";
import { formatError } from "./format-error.js";
import {
  CONFIRMATION_TTL_MS,
  ConfirmAction,
  issueConfirmationCode,
  verifyConfirmationCode,
} from "./confirmation-code.js";

export interface ConfirmedActionOptions {
  entity: string;
  id: string;
  confirmationCode?: string;
  action: ConfirmAction;
  fetch: (id: string) => Promise<any>;
  summarize: (record: any) => string;
  perform: (record: any) => Promise<any>;
}

const REFUSAL: Record<string, string> = {
  invalid: "The confirmation code is not valid for this record and action.",
  expired: "The confirmation code has expired.",
  used: "The confirmation code was already used.",
  changed: "The record was modified after the code was issued.",
};

/**
 * Two-step guard for voids and permanent deletes. Without a code it returns a
 * summary plus a code; with a code it re-fetches, verifies the code against the
 * current SyncToken and only then performs the action.
 */
export async function runConfirmedAction(opts: ConfirmedActionOptions): Promise<ToolResponse<any>> {
  try {
    const record = await opts.fetch(opts.id);
    if (!record || record.Id === undefined || record.Id === null) {
      return { result: null, isError: true, error: `${opts.entity} ${opts.id} not found` };
    }
    const target = {
      entity: opts.entity,
      id: opts.id,
      syncToken: String(record.SyncToken),
      action: opts.action,
    };

    if (!opts.confirmationCode) {
      return {
        result: {
          status: "confirmation_required",
          action: opts.action,
          summary: opts.summarize(record),
          confirmation_code: issueConfirmationCode(target),
          expires_in_minutes: CONFIRMATION_TTL_MS / 60_000,
        },
        isError: false,
        error: null,
      };
    }

    const verdict = verifyConfirmationCode(opts.confirmationCode, target);
    if (verdict !== "ok") {
      return {
        result: null,
        isError: true,
        error: `${REFUSAL[verdict]} Nothing was ${opts.action === "void" ? "voided" : "deleted"}. Call again without confirmation_code to request a new code.`,
      };
    }

    const result = await opts.perform(record);
    return { result, isError: false, error: null };
  } catch (error) {
    return { result: null, isError: true, error: formatError(error) };
  }
}

const money = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Builds "<Entity> #<DocNumber or Id>, dated ..., total ..., <name>, <n> lines — will be <verb>". */
export function summarizeRecord(label: string, record: any, verb: string): string {
  const parts = [`${label} #${record.DocNumber ?? record.Id}`];
  if (record.TxnDate) parts.push(`dated ${record.TxnDate}`);
  if (typeof record.TotalAmt === "number") parts.push(`total ${money(record.TotalAmt)}`);
  const name = record.CustomerRef?.name ?? record.VendorRef?.name ?? record.EntityRef?.name;
  if (name) parts.push(name);
  if (Array.isArray(record.Line)) parts.push(`${record.Line.length} lines`);
  return `${parts.join(", ")} — will be ${verb}`;
}

/** Tool-handler text for a runConfirmedAction response. */
export function confirmationToolText(r: ToolResponse<any>, doneLabel: string): string[] {
  if (r.result?.status === "confirmation_required") {
    const c = r.result;
    return [
      `Confirmation required: ${c.summary}.`,
      `confirmation_code: ${c.confirmation_code} (expires in ${c.expires_in_minutes} minutes, single use).`,
      `Nothing has been changed yet. Show this summary to the user and ask whether to proceed. Only if they agree, call this tool again with the same id and confirmation_code.`,
    ];
  }
  return [doneLabel, JSON.stringify(r.result)];
}

export function promisify(fn: (cb: (err: any, res: any) => void) => void): Promise<any> {
  return new Promise((resolve, reject) => fn((err, res) => (err ? reject(err) : resolve(res))));
}
