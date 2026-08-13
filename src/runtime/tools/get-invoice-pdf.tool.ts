import { z } from "zod";
import { pdfDownloadTarget } from "../download-links.js";
import { PdfTooLargeError, pdfHandleTtlMs, storePdfForDownload } from "../pdf-handles.js";
import { formatError } from "../qbo-error.js";
import { getInvoicePdfBytes } from "../qbo-invoice-methods.js";
import { currentTenant } from "../tenant-context.js";
import type { AnyToolDefinition } from "../tool-allowlist.js";

/**
 * Returns a link to an invoice PDF, never the document itself.
 *
 * Upstream returned the bytes base64-encoded in the tool response, or wrote them
 * to disk when an environment variable allowed it. Base64 in a tool response puts
 * tens of kilobytes of binary into a model's context, where nothing can be done
 * with it and every later turn pays to carry it; the disk path gives this service
 * a filesystem dependency it has no reason to have.
 *
 * So the bytes are fetched once, held under a single-use handle for minutes, and
 * the answer is a URL. Fetching now rather than at download time is deliberate:
 * the tenant's access token is in scope here and must not be stored anywhere to
 * be replayed later.
 */

/** Every PDF starts with this. Anything else is not a document. */
const PDF_MAGIC = "%PDF-";

const toolSchema = z.object({
  invoice_id: z
    .string()
    .min(1)
    .max(32)
    .regex(/^[0-9]+$/, "invoice_id must be a QuickBooks numeric id"),
});

const toolHandler = async ({ params }: { params: z.infer<typeof toolSchema> }) => {
  const { invoice_id: invoiceId } = params;
  try {
    const bytes = await getInvoicePdfBytes(invoiceId);

    if (bytes.length === 0 || bytes.subarray(0, PDF_MAGIC.length).toString("latin1") !== PDF_MAGIC) {
      return text(
        `QuickBooks did not return a PDF for invoice ${invoiceId}. Nothing was saved. This usually means ` +
          "the invoice id does not exist in this company.",
      );
    }

    const { realmId } = currentTenant();
    const stored = storePdfForDownload({ realmId, invoiceId, bytes });
    const target = pdfDownloadTarget(realmId, stored.handle);
    const validForSeconds = Math.round(pdfHandleTtlMs() / 1000);

    return {
      content: [
        {
          type: "text" as const,
          text:
            `Invoice ${invoiceId} PDF is ready (${stored.byteLength} bytes). The link works once and ` +
            `expires in ${validForSeconds}s.`,
        },
        {
          type: "text" as const,
          text: JSON.stringify({
            invoice_id: invoiceId,
            download_url: target.url ?? null,
            download_path: target.path,
            byte_length: stored.byteLength,
            expires_at: new Date(stored.expiresAt).toISOString(),
            single_use: true,
          }),
        },
      ],
    };
  } catch (error) {
    if (error instanceof PdfTooLargeError) {
      return text(`Invoice ${invoiceId}'s PDF was not retained: ${error.message}`);
    }
    return text(`Error preparing invoice ${invoiceId} as PDF: ${formatError(error)}`);
  }
};

function text(message: string): { content: Array<{ type: "text"; text: string }> } {
  return { content: [{ type: "text" as const, text: message }] };
}

export const GetInvoicePdfTool: AnyToolDefinition = {
  name: "get_invoice_pdf",
  description:
    "Prepare an invoice's PDF for download and return a single-use link that expires in minutes. Returns a " +
    "link rather than the document, so the file never passes through the conversation.",
  schema: toolSchema,
  handler: toolHandler,
} as unknown as AnyToolDefinition;
