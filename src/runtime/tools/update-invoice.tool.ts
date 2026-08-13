import { z } from "zod";
import { assertInvoiceFieldsSupported, UnsupportedForCompanyError } from "../invoice-field-policy.js";
import { companyCapabilitiesOrNull } from "../preferences.js";
import { formatError, hasQuickbooksFaultCode, QBO_FAULT_STALE_OBJECT } from "../qbo-error.js";
import { getInvoiceById, updateInvoiceEntity } from "../qbo-invoice-methods.js";
import type { AnyToolDefinition } from "../tool-allowlist.js";
import { describeInvoice } from "../projections.js";

/**
 * Sparse update that actually is sparse.
 *
 * Upstream's handler reads the invoice, then posts `{...existing, ...patch, Id,
 * sparse: true}`. Spreading the whole invoice defeats the point of a sparse
 * update: every field is now present in the payload, so any change another user
 * made between our read and our write is overwritten with the value we read
 * moments earlier. Sparse exists precisely to avoid that lost update. This sends
 * only the caller's fields plus Id and the SyncToken read immediately before.
 *
 * A stale SyncToken (fault 5010) means someone else wrote first. That is retried
 * exactly once against a freshly read token, because the second failure means
 * genuine contention rather than a race we lost by a hair — and a write must not
 * be retried in a loop. Anything else fails immediately with the provider's fault
 * code intact.
 */

/**
 * Fields QuickBooks derives or owns. Passing them back either errors or silently
 * does nothing, and a model that "fixes" a total by writing TotalAmt would be
 * reasoning about the wrong thing entirely.
 */
const REJECTED_PATCH_KEYS = [
  "Id",
  "SyncToken",
  "sparse",
  "MetaData",
  "TotalAmt",
  "Balance",
  "HomeTotalAmt",
  "domain",
] as const;

const toolSchema = z.object({
  invoice_id: z
    .string()
    .min(1)
    .regex(/^[0-9]+$/, "invoice_id must be a QuickBooks numeric id"),
  patch: z
    .record(z.unknown())
    .refine((patch) => Object.keys(patch).length > 0, "patch must change at least one field")
    .refine(
      (patch) => !Object.keys(patch).some((key) => (REJECTED_PATCH_KEYS as readonly string[]).includes(key)),
      `patch must not set QuickBooks-managed fields (${REJECTED_PATCH_KEYS.join(", ")})`,
    )
    .describe(
      "Only the invoice fields to change, e.g. {\"DueDate\":\"2026-09-01\"}. Omitted fields are left " +
        "untouched. Totals and balances are derived by QuickBooks and cannot be set.",
    ),
});

interface InvoiceWithSyncToken {
  Id?: string;
  SyncToken?: string;
  DocNumber?: string;
}

async function sparseUpdateOnce(
  invoiceId: string,
  patch: Record<string, unknown>,
): Promise<InvoiceWithSyncToken> {
  const current = await getInvoiceById<InvoiceWithSyncToken>(invoiceId);
  if (!current?.SyncToken) {
    throw new Error(`Invoice ${invoiceId} returned no SyncToken, so it cannot be updated safely`);
  }
  return updateInvoiceEntity<InvoiceWithSyncToken>({
    ...patch,
    Id: invoiceId,
    SyncToken: current.SyncToken,
    sparse: true,
  });
}

const toolHandler = async ({ params }: { params: z.infer<typeof toolSchema> }) => {
  const patch = params.patch as Record<string, unknown>;
  try {
    // Before touching the invoice: some fields are accepted by QuickBooks and then
    // quietly ignored depending on how this company is configured, which would
    // report success for a change that did not happen.
    assertInvoiceFieldsSupported(patch, await companyCapabilitiesOrNull());

    let updated: InvoiceWithSyncToken;
    try {
      updated = await sparseUpdateOnce(params.invoice_id, patch);
    } catch (error) {
      if (!hasQuickbooksFaultCode(error, QBO_FAULT_STALE_OBJECT)) throw error;
      // Someone wrote between our read and our write. Re-read and try once more.
      try {
        updated = await sparseUpdateOnce(params.invoice_id, patch);
      } catch (retryError) {
        if (!hasQuickbooksFaultCode(retryError, QBO_FAULT_STALE_OBJECT)) throw retryError;
        return {
          content: [
            {
              type: "text" as const,
              text:
                `Invoice ${params.invoice_id} is being changed by someone else and the update was ` +
                "not applied. Nothing was written. Read the invoice again to see the current " +
                `values before retrying. Provider detail: ${formatError(retryError)}`,
            },
          ],
        };
      }
    }
    return {
      content: [
        {
          type: "text" as const,
          text: `Invoice ${updated.DocNumber ?? params.invoice_id} updated. Changed: ${Object.keys(patch).join(", ")}.`,
        },
        { type: "text" as const, text: JSON.stringify(describeInvoice(updated)) },
      ],
    };
  } catch (error) {
    // Already an explanation of what this company supports; formatError would only
    // wrap it in provider vocabulary the caller cannot act on.
    if (error instanceof UnsupportedForCompanyError) {
      return { content: [{ type: "text" as const, text: error.message }] };
    }
    return { content: [{ type: "text" as const, text: `Error updating invoice: ${formatError(error)}` }] };
  }
};

export const SparseUpdateInvoiceTool: AnyToolDefinition = {
  name: "update_invoice",
  description:
    "Update specific fields on an existing QuickBooks Online invoice. Only the fields you supply " +
    "change; everything else is left as it is. Totals are derived by QuickBooks and cannot be set.",
  schema: toolSchema,
  handler: toolHandler,
} as unknown as AnyToolDefinition;
