import { QuickbooksClient } from "../clients/quickbooks-client.js";
import { ToolResponse } from "../types/tool-response.js";
import { formatError } from "../helpers/format-error.js";

export interface CreateAccountInput {
  name: string;
  type: string; // e.g., Expense, Income, Bank, etc.
  sub_type?: string;
  description?: string;
  // When set, create the account as a sub-account of this parent (the parent's
  // Id). SubAccount:true and ParentRef:{value:parent_id} are sent. The new
  // account's AccountType must match the parent's, or QBO rejects it.
  parent_id?: string;
}

// Coerce a parent reference into the QBO reference-object shape { value: "<id>" }.
// Accepts { value: "5" } (canonical), "5" (bare string), or 5 (number).
function normalizeParentRef(value: any): { value: string } | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "object" && value.value !== undefined) {
    return { value: String(value.value) };
  }
  return { value: String(value) };
}

// Helper to normalize field values to the correct data type expected by Quickbooks.
// NOTE: ParentRef is intentionally NOT in this scalar map — it is a QBO nested
// reference object ({ value: "<id>" }), and String()-coercing it yields the
// literal "[object Object]" (QBO error 2010). ParentRef is built separately via
// normalizeParentRef() below.
const accountFieldTypeMap: Record<string, "string" | "boolean" | "number"> = {
  Name: "string",
  AccountType: "string",
  AccountSubType: "string",
  Description: "string",
  Classification: "string",
  Active: "boolean",
  SubAccount: "boolean",
  CurrentBalance: "number",
};

function normalizeAccountPayload(payload: Record<string, any>): Record<string, any> {
  const normalized: Record<string, any> = {};
  Object.entries(payload).forEach(([key, value]) => {
    if (value === undefined || value === null) return; // skip undefined
    const expectedType = accountFieldTypeMap[key];
    if (!expectedType) {
      // passthrough unknown keys without modification
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

export async function createQuickbooksAccount(data: CreateAccountInput): Promise<ToolResponse<any>> {
  try {
    const quickbooks = await QuickbooksClient.getInstance();

    // Build initial payload then normalize.
    const basePayload: any = {
      Name: data.name,
      AccountType: data.type,
      AccountSubType: data.sub_type,
      Description: data.description,
    };

    const payload = normalizeAccountPayload(basePayload);

    // Sub-account creation: when a parent is supplied, mark SubAccount:true and
    // attach the ParentRef reference object. Built after normalization so the
    // nested ParentRef object is not run through the scalar field-type map.
    const parentRef = normalizeParentRef(data.parent_id);
    if (parentRef) {
      payload.SubAccount = true;
      payload.ParentRef = parentRef;
    }

    return new Promise((resolve) => {
      (quickbooks as any).createAccount(payload, (err: any, account: any) => {
        if (err) {
          resolve({ result: null, isError: true, error: formatError(err) });
        } else {
          resolve({ result: account, isError: false, error: null });
        }
      });
    });
  } catch (error) {
    return { result: null, isError: true, error: formatError(error) };
  }
} 
