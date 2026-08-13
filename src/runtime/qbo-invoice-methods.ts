import { QuickbooksClient } from "./qbo-client.js";

/**
 * Typed access to two node-quickbooks methods that upstream's vendored
 * declaration file omits.
 *
 * Both exist in the library at the pinned version (index.js: sendInvoicePdf at
 * 755, voidInvoice at 1530); only the type declarations are missing. Declaration
 * merging cannot reach them because the vendored file exports the class as
 * `export default class QuickBooks`, so an interface declared by local name does
 * not merge with that binding — and editing src/vendor/types would break the
 * copy-only re-sync contract. So the assertion is confined to this one file and
 * every tool goes through these wrappers instead of casting for itself.
 */

/** The subset of the client surface these wrappers rely on. */
interface InvoiceMutationMethods {
  voidInvoice(idOrEntity: string | object, callback: (error: unknown, invoice: unknown) => void): void;
  sendInvoicePdf(id: string, sendTo: string, callback: (error: unknown, invoice: unknown) => void): void;
  getInvoice(id: string, callback: (error: unknown, invoice: unknown) => void): void;
  updateInvoice(entity: object, callback: (error: unknown, invoice: unknown) => void): void;
  getInvoicePdf(id: string, callback: (error: unknown, pdf: unknown) => void): void;
  createInvoice(entity: object, callback: (error: unknown, invoice: unknown) => void): void;
}

async function invoiceMethods(): Promise<InvoiceMutationMethods> {
  const client = await QuickbooksClient.getInstance();
  // Safe because the methods are present at runtime and this file is the only
  // place that asserts it; a version bump that removed them would fail the
  // integration checks rather than silently misbehave.
  return client as unknown as InvoiceMutationMethods;
}

function promisify<T>(run: (callback: (error: unknown, value: unknown) => void) => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    run((error, value) => {
      if (error) reject(error);
      else resolve(value as T);
    });
  });
}

/**
 * Voids an invoice. Passing the id rather than an entity makes the library read
 * the current invoice first, so the void always carries a fresh SyncToken instead
 * of one the caller guessed.
 */
export async function voidInvoiceById<T>(invoiceId: string): Promise<T> {
  const methods = await invoiceMethods();
  return promisify<T>((callback) => methods.voidInvoice(invoiceId, callback));
}

/** Emails an invoice PDF to an explicit recipient and marks it sent. */
export async function sendInvoicePdfTo<T>(invoiceId: string, sendTo: string): Promise<T> {
  const methods = await invoiceMethods();
  return promisify<T>((callback) => methods.sendInvoicePdf(invoiceId, sendTo, callback));
}

/** Reads one invoice. Used to obtain a current SyncToken before a mutation. */
export async function getInvoiceById<T>(invoiceId: string): Promise<T> {
  const methods = await invoiceMethods();
  return promisify<T>((callback) => methods.getInvoice(invoiceId, callback));
}

/** Posts an invoice mutation. The caller owns building a correct sparse payload. */
export async function updateInvoiceEntity<T>(entity: object): Promise<T> {
  const methods = await invoiceMethods();
  return promisify<T>((callback) => methods.updateInvoice(entity, callback));
}

/**
 * Creates an invoice.
 *
 * `requestId` is not a field on the entity: node-quickbooks lifts it off and sends
 * it as QuickBooks' own `requestid` query parameter, which is Intuit's idempotency
 * mechanism. That is why it is a separate argument here rather than something a
 * caller could set by accident inside the entity.
 */
export async function createInvoiceEntity<T>(entity: object, providerRequestId: string): Promise<T> {
  const methods = await invoiceMethods();
  return promisify<T>((callback) => methods.createInvoice({ ...entity, requestId: providerRequestId }, callback));
}

/**
 * Fetches an invoice as PDF bytes.
 *
 * The library hands back whatever the response body was, so a non-PDF here means
 * QuickBooks answered with something other than a document and the caller must
 * not treat it as one.
 */
export async function getInvoicePdfBytes(invoiceId: string): Promise<Buffer> {
  const methods = await invoiceMethods();
  const body = await promisify<unknown>((callback) => methods.getInvoicePdf(invoiceId, callback));
  if (!Buffer.isBuffer(body)) {
    throw new Error(`QuickBooks returned a ${typeof body} for invoice ${invoiceId}'s PDF, not document bytes`);
  }
  return body;
}
