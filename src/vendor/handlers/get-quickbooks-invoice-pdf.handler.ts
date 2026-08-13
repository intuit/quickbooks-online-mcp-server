import { QuickbooksClient } from "../clients/quickbooks-client.js";
import { ToolResponse } from "../types/tool-response.js";
import { formatError } from "../helpers/format-error.js";

/**
 * Hard cap on the PDF size we'll buffer in memory before surfacing it to the
 * caller. QBO invoice PDFs in practice run 25-100 KB; this leaves plenty of
 * headroom for unusually long multi-page invoices while preventing a
 * pathologically large response from ballooning process memory.
 *
 * Override via QBO_PDF_MAX_BYTES env var when an unusually large PDF is
 * legitimately expected.
 */
const DEFAULT_MAX_BYTES = 50 * 1024 * 1024; // 50 MiB

function maxBytes(): number {
  const raw = process.env.QBO_PDF_MAX_BYTES;
  if (!raw) return DEFAULT_MAX_BYTES;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_MAX_BYTES;
  return parsed;
}

/**
 * Download a QuickBooks Online invoice as a PDF and return the raw bytes.
 *
 * Uses the underlying node-quickbooks `getInvoicePdf` method, which calls the
 * QBO REST endpoint `GET /v3/company/{realmId}/invoice/{id}/pdf` with
 * `Accept: application/pdf`. The library invokes the callback with a Buffer
 * containing the PDF body.
 *
 * Enforces an in-memory size cap (see DEFAULT_MAX_BYTES) so a runaway response
 * cannot blow up the MCP host's heap.
 */
export async function getQuickbooksInvoicePdf(
  invoiceId: string
): Promise<ToolResponse<Buffer>> {
  try {
    const quickbooks = await QuickbooksClient.getInstance();

    return new Promise((resolve) => {
      (quickbooks as any).getInvoicePdf(invoiceId, (err: any, pdf: Buffer) => {
        if (err) {
          resolve({
            result: null,
            isError: true,
            error: formatError(err),
          });
          return;
        }

        const cap = maxBytes();
        if (pdf && pdf.length > cap) {
          resolve({
            result: null,
            isError: true,
            error: `PDF size ${pdf.length} bytes exceeds cap of ${cap} bytes (override with QBO_PDF_MAX_BYTES).`,
          });
          return;
        }

        resolve({
          result: pdf,
          isError: false,
          error: null,
        });
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
