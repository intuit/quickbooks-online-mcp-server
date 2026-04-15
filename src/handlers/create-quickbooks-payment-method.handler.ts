import { getQuickbooks } from "../clients/quickbooks-client.js";
import { ToolResponse } from "../types/tool-response.js";
import { formatError } from "../helpers/format-error.js";

export interface CreatePaymentMethodInput {
  name: string;
  type?: "CREDIT_CARD" | "NON_CREDIT_CARD";
}

export async function createQuickbooksPaymentMethod(data: CreatePaymentMethodInput): Promise<ToolResponse<any>> {
  try {
    const quickbooks = await getQuickbooks();
    const payload: any = { Name: data.name };
    if (data.type) payload.Type = data.type;

    return new Promise((resolve) => {
      (quickbooks as any).createPaymentMethod(payload, (err: any, created: any) => {
        if (err) resolve({ result: null, isError: true, error: formatError(err) });
        else resolve({ result: created, isError: false, error: null });
      });
    });
  } catch (error) {
    return { result: null, isError: true, error: formatError(error) };
  }
}
