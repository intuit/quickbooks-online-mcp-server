import { quickbooksClient } from "../clients/quickbooks-client.js";
import { ToolResponse } from "../types/tool-response.js";
import { formatError } from "../helpers/format-error.js";

/**
 * Fetch a QBO report (P&L, Balance Sheet, General Ledger, Trial Balance).
 *
 * Uses the node-quickbooks reportQuery method which wraps the
 * /v3/company/{realmId}/reports/{reportName} endpoint.
 */
export async function getQuickbooksReport(
  reportName: string,
  params: Record<string, string>
): Promise<ToolResponse<any>> {
  try {
    await quickbooksClient.authenticate();
    const quickbooks = quickbooksClient.getQuickbooks();

    return new Promise((resolve) => {
      quickbooks.reportQuery(reportName, params, (err: any, report: any) => {
        if (err) {
          resolve({
            result: null,
            isError: true,
            error: formatError(err),
          });
        } else {
          resolve({
            result: report,
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
