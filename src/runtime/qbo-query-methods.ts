import { QuickbooksClient } from "./qbo-client.js";

/**
 * Typed access to the node-quickbooks finders and single-entity getters the
 * invoice release needs.
 *
 * Same reasoning as qbo-invoice-methods.ts: upstream's vendored declaration file
 * only declares findCustomers and getCustomer, so every vendored handler reaches
 * the rest through `(quickbooks as any).findItems(...)`. Declaration merging
 * cannot fix that from outside — the vendored file exports the class as
 * `export default class QuickBooks`, so an interface declared by local name does
 * not merge with the binding — and editing src/vendor/types would break the
 * copy-only re-sync contract. So the one assertion lives here and every tool
 * calls these wrappers instead of casting for itself.
 */

type Callback = (error: unknown, value: unknown) => void;

interface QueryMethods {
  findInvoices(criteria: unknown, callback: Callback): void;
  findCustomers(criteria: unknown, callback: Callback): void;
  findItems(criteria: unknown, callback: Callback): void;
  findTerms(criteria: unknown, callback: Callback): void;
  findTaxCodes(criteria: unknown, callback: Callback): void;
  getCustomer(id: string, callback: Callback): void;
  getItem(id: string, callback: Callback): void;
  getCompanyInfo(id: string, callback: Callback): void;
  getPreferences(callback: Callback): void;
  realmId?: string;
}

async function queryMethods(): Promise<QueryMethods> {
  const client = await QuickbooksClient.getInstance();
  // Safe because the methods exist at the pinned version and this file is the
  // only place that asserts it; a version bump that removed one would fail the
  // integration checks rather than silently misbehave.
  return client as unknown as QueryMethods;
}

function promisify<T>(run: (callback: Callback) => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    run((error, value) => {
      if (error) reject(error);
      else resolve(value as T);
    });
  });
}

/**
 * Entity key inside a QueryResponse envelope. QuickBooks omits the key entirely
 * when nothing matched, which is why this returns an empty array rather than
 * letting `undefined` reach a caller expecting rows.
 */
function rows(response: unknown, entityKey: string): Array<Record<string, unknown>> {
  if (typeof response !== "object" || response === null) return [];
  const queryResponse = (response as { QueryResponse?: unknown }).QueryResponse;
  if (typeof queryResponse !== "object" || queryResponse === null) return [];
  const value = (queryResponse as Record<string, unknown>)[entityKey];
  return Array.isArray(value) ? (value as Array<Record<string, unknown>>) : [];
}

export type QboRow = Record<string, unknown>;

export async function findInvoiceRows(criteria: unknown): Promise<QboRow[]> {
  const methods = await queryMethods();
  const response = await promisify<unknown>((callback) => methods.findInvoices(criteria, callback));
  return rows(response, "Invoice");
}

export async function findCustomerRows(criteria: unknown): Promise<QboRow[]> {
  const methods = await queryMethods();
  const response = await promisify<unknown>((callback) => methods.findCustomers(criteria, callback));
  return rows(response, "Customer");
}

export async function findItemRows(criteria: unknown): Promise<QboRow[]> {
  const methods = await queryMethods();
  const response = await promisify<unknown>((callback) => methods.findItems(criteria, callback));
  return rows(response, "Item");
}

export async function findTermRows(criteria: unknown): Promise<QboRow[]> {
  const methods = await queryMethods();
  const response = await promisify<unknown>((callback) => methods.findTerms(criteria, callback));
  return rows(response, "Term");
}

export async function findTaxCodeRows(criteria: unknown): Promise<QboRow[]> {
  const methods = await queryMethods();
  const response = await promisify<unknown>((callback) => methods.findTaxCodes(criteria, callback));
  return rows(response, "TaxCode");
}

export async function getCustomerById(id: string): Promise<QboRow> {
  const methods = await queryMethods();
  return promisify<QboRow>((callback) => methods.getCustomer(id, callback));
}

export async function getItemById(id: string): Promise<QboRow> {
  const methods = await queryMethods();
  return promisify<QboRow>((callback) => methods.getItem(id, callback));
}

/**
 * Company info is addressed by the realm id itself. Reading it from the client,
 * which resolved it from the tenant scope, keeps the caller from supplying one.
 */
export async function getCompanyInfoForTenant(): Promise<QboRow> {
  const methods = await queryMethods();
  const realmId = methods.realmId;
  if (typeof realmId !== "string" || realmId.length === 0) {
    throw new Error("QuickBooks client exposed no realmId, so company info cannot be read");
  }
  return promisify<QboRow>((callback) => methods.getCompanyInfo(realmId, callback));
}

/**
 * Reads the company's Preferences. There is exactly one per company, addressed by
 * no id, so this takes no argument — the company is the tenant's.
 */
export async function getPreferencesForTenant(): Promise<QboRow> {
  const methods = await queryMethods();
  return promisify<QboRow>((callback) => methods.getPreferences(callback));
}
