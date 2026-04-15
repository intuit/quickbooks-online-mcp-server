import { getQuickbooks } from "../clients/quickbooks-client.js";
import { ToolResponse } from "../types/tool-response.js";
import { formatError } from "../helpers/format-error.js";

/**
 * Delete (void) an invoice in QuickBooks Online
 * Note: QuickBooks doesn't truly delete invoices - it voids them
 */
export async function deleteQuickbooksInvoice(idOrEntity: any): Promise<ToolResponse<any>> {
  try {
    const quickbooks = await getQuickbooks();

    return new Promise((resolve) => {
      // Try deleteInvoice first if available
      const hasDelete = typeof (quickbooks as any).deleteInvoice === "function";

      if (hasDelete) {
        (quickbooks as any).deleteInvoice(idOrEntity, (err: any, response: any) => {
          if (err) {
            // If delete fails, try voiding the invoice
            voidInvoice(err);
          } else {
            resolve({ result: response, isError: false, error: null });
          }
        });
      } else {
        voidInvoice();
      }

      function voidInvoice(originalError?: any) {
        // Helper to fetch entity when only ID supplied
        const getEntity = (cb: (invoice: any) => void) => {
          if (typeof idOrEntity === "object" && idOrEntity?.Id) {
            cb(idOrEntity);
          } else {
            (quickbooks as any).getInvoice(idOrEntity, (e: any, inv: any) => cb(inv));
          }
        };

        getEntity((invoiceEntity) => {
          if (!invoiceEntity || !invoiceEntity.Id) {
            resolve({
              result: null,
              isError: true,
              error: formatError(originalError || "Unable to retrieve invoice for void operation"),
            });
            return;
          }

          // Void the invoice by setting PrivateNote and using sparse update
          const voidedEntity = {
            Id: invoiceEntity.Id,
            SyncToken: invoiceEntity.SyncToken,
            sparse: true,
            PrivateNote: "Voided via API",
          };

          (quickbooks as any).voidInvoice(voidedEntity, (err: any, resp: any) => {
            if (err) {
              resolve({ result: null, isError: true, error: formatError(err) });
            } else {
              resolve({ result: resp, isError: false, error: null });
            }
          });
        });
      }
    });
  } catch (error) {
    return { result: null, isError: true, error: formatError(error) };
  }
}
