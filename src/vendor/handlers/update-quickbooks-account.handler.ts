import { QuickbooksClient } from "../clients/quickbooks-client.js";
import { ToolResponse } from "../types/tool-response.js";
import { formatError } from "../helpers/format-error.js";

export interface UpdateAccountInput {
  account_id: string;
  patch: Record<string, any>;
}

// Scalar field-type map for normalization. NOTE: ParentRef is intentionally
// NOT listed here. ParentRef is a QBO nested reference object ({ value: "<id>" }),
// not a scalar. Running it through String() yields the literal "[object Object]",
// which QBO rejects with error code 2010 ("failed to parse json object; a
// property specified is unsupported or invalid") — making it impossible to
// re-parent (nest) an account. ParentRef is handled separately below.
const updateFieldTypeMap: Record<string, "string" | "boolean" | "number"> = {
  Name: "string",
  AccountType: "string",
  AccountSubType: "string",
  Description: "string",
  Classification: "string",
  Active: "boolean",
  SubAccount: "boolean",
  CurrentBalance: "number",
};

// Coerce a caller-supplied parent reference into the QBO reference-object shape
// { value: "<id>" }. Accepts { value: "5" } (canonical), "5" (bare string), or
// 5 (number).
function normalizeParentRef(value: any): { value: string } | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "object" && value.value !== undefined) {
    return { value: String(value.value) };
  }
  return { value: String(value) };
}

function normalizePatch(patch: Record<string, any>): Record<string, any> {
  const normalized: Record<string, any> = {};
  Object.entries(patch).forEach(([key, value]) => {
    if (value === undefined) return;
    if (key === "ParentRef") {
      const ref = normalizeParentRef(value);
      if (ref) normalized[key] = ref;
      return;
    }
    const expectedType = updateFieldTypeMap[key];
    if (!expectedType) {
      normalized[key] = value;
      return;
    }
    switch (expectedType) {
      case "string":
        normalized[key] = String(value);
        break;
      case "boolean":
        normalized[key] = typeof value === "boolean" ? value : value === "true";
        break;
      case "number":
        normalized[key] = typeof value === "number" ? value : Number(value);
        break;
      default:
        normalized[key] = value;
    }
  });
  return normalized;
}

export async function updateQuickbooksAccount({ account_id, patch }: UpdateAccountInput): Promise<ToolResponse<any>> {
  try {
    const quickbooks = await QuickbooksClient.getInstance();
    const existing: any = await new Promise((res, rej) => {
      (quickbooks as any).getAccount(account_id, (e: any, acc: any) => (e ? rej(e) : res(acc)));
    });

    // When merging existing with patch, normalize the patch first.
    const normalizedPatch = normalizePatch(patch);
    // QBO's Account entity does NOT support sparse updates: a sparse:true body
    // returns error 2020 ("Required parameter Name is missing"). We perform a
    // full-object update by spreading the freshly-fetched existing account
    // (which carries Name/AccountType/AccountSubType/Classification/SyncToken)
    // and overlaying the caller's patch. sparse is intentionally not set.
    const payload = { ...existing, ...normalizedPatch, Id: account_id };
    delete (payload as any).sparse;

    return new Promise((resolve) => {
      (quickbooks as any).updateAccount(payload, (err: any, account: any) => {
        if (err) resolve({ result: null, isError: true, error: formatError(err) });
        else resolve({ result: account, isError: false, error: null });
      });
    });
  } catch (error) {
    return { result: null, isError: true, error: formatError(error) };
  }
} 
