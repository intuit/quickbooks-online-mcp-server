import { createOnce, idempotencyScope } from "../idempotency.js";
import { buildInvoiceEntity, draftTotal, invoiceDraftSchema, type InvoiceDraft } from "../invoice-draft.js";
import { assertInvoiceFieldsSupported, UnsupportedForCompanyError } from "../invoice-field-policy.js";
import { companyCapabilitiesOrNull } from "../preferences.js";
import { formatError, hasQuickbooksFaultCode, QBO_FAULT_DUPLICATE_DOC_NUMBER } from "../qbo-error.js";
import { createInvoiceEntity } from "../qbo-invoice-methods.js";
import { formatMoney } from "../money.js";
import { describeInvoice } from "../projections.js";
import type { AnyToolDefinition } from "../tool-allowlist.js";

/**
 * Creates an invoice exactly once per intent.
 *
 * Replaces upstream's create_invoice, which takes a raw QuickBooks Invoice entity
 * and forwards it with no idempotency of any kind. Creating money-shaped records is
 * the one operation where a retry is not free: a model that re-plans, a transport
 * that retries, or a user who confirms twice would each bill the customer again, and
 * nothing in the request distinguishes that from a genuine second invoice.
 *
 * So the same intent yields the same invoice — collapsed here when we can see the
 * repeat, and by QuickBooks' own `requestid` when we cannot.
 */

const toolHandler = async ({ params }: { params: InvoiceDraft }) => {
  try {
    const entity = buildInvoiceEntity(params);

    // Refuse fields this company would accept and then quietly ignore, before the
    // idempotency key is claimed — otherwise a rejected attempt would poison the
    // key for the corrected one.
    assertInvoiceFieldsSupported(entity, await companyCapabilitiesOrNull());

    const scope = idempotencyScope({ toolArguments: params, callerKey: params.idempotency_key });

    const { invoice, replayed } = await createOnce(scope, () =>
      createInvoiceEntity<Record<string, unknown>>(entity, scope.providerRequestId),
    );

    const summary = describeInvoice(invoice);
    const total = draftTotal(params);

    return {
      content: [
        {
          type: "text" as const,
          text: replayed
            ? `This invoice was already created — returning it rather than billing the customer twice. ` +
              `Invoice ${summary.doc_number ?? summary.id} for ${formatMoney(total, summary.currency)}.`
            : `Invoice ${summary.doc_number ?? summary.id} created for ${formatMoney(total, summary.currency)}` +
              `${typeof summary.customer_name === "string" ? ` for ${summary.customer_name}` : ""}.`,
        },
        { type: "text" as const, text: JSON.stringify({ ...summary, replayed }) },
      ],
    };
  } catch (error) {
    if (error instanceof UnsupportedForCompanyError) {
      return { content: [{ type: "text" as const, text: error.message }] };
    }
    // 6140 is a duplicate document number. Never retried: the number belongs to an
    // invoice that already exists, and a retry would either fail identically or, if
    // the company allows duplicates, create the second invoice we are avoiding.
    if (hasQuickbooksFaultCode(error, QBO_FAULT_DUPLICATE_DOC_NUMBER)) {
      return {
        content: [
          {
            type: "text" as const,
            text:
              `Invoice number ${params.doc_number ?? "(supplied)"} is already used in this company, so nothing ` +
              "was created. Search for that number to see the existing invoice, or leave doc_number out and " +
              "let QuickBooks assign the next one.",
          },
        ],
      };
    }
    return { content: [{ type: "text" as const, text: `Error creating invoice: ${formatError(error)}` }] };
  }
};

export const CreateInvoiceTool: AnyToolDefinition = {
  name: "create_invoice",
  description:
    "Create an invoice in the connected QuickBooks company. Resolve the customer with search_customers and " +
    "each line's product or service with search_items first. Safe to retry: the same arguments return the " +
    "invoice already created rather than billing the customer twice.",
  schema: invoiceDraftSchema,
  handler: toolHandler,
} as unknown as AnyToolDefinition;
