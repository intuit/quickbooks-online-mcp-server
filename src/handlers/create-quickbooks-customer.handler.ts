import { getQuickbooks } from "../clients/quickbooks-client.js";
import { ToolResponse } from "../types/tool-response.js";
import { formatError } from "../helpers/format-error.js";

/**
 * Create a customer in QuickBooks Online
 * @param customerData The customer object to create
 */
export async function createQuickbooksCustomer(customerData: any): Promise<ToolResponse<any>> {
  try {
    const quickbooks = await getQuickbooks();

    return new Promise((resolve) => {
      quickbooks.createCustomer(customerData, (err: any, customer: any) => {
        if (err) {
          resolve({
            result: null,
            isError: true,
            error: formatError(err),
          });
        } else {
          resolve({
            result: customer,
            isError: false,
            error: null,
          });
        }
      });
    });
  } catch (error) {
    return {
      result: null,
      isError: true,
      error: formatError(error),
    };
  }
} 