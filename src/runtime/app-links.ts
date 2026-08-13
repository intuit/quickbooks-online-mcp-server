/**
 * Links into QuickBooks itself, so a person can check what a tool did.
 *
 * A tool result is evidence, and evidence a user cannot verify is just an assertion. The
 * one thing the caller cannot work out for itself is the host: sandbox books live on a
 * different domain from real ones, and guessing wrong sends someone to a company that
 * either is not theirs or does not exist. This service is told which environment its
 * tokens belong to, so it is the only component that can build the link correctly.
 *
 * The invoice id here is QuickBooks' internal Id, not the document number a customer
 * sees. QuickBooks' own deep link takes the internal id, and the two are easy to confuse
 * because the document number is the one printed on the invoice.
 */

import type { QboEnvironment } from "./tenant-context.js";

const APP_HOSTS: Readonly<Record<QboEnvironment, string>> = {
  sandbox: "https://sandbox.qbo.intuit.com",
  production: "https://qbo.intuit.com",
};

let environment: QboEnvironment | undefined;

export function configureAppLinks(value: QboEnvironment): void {
  environment = value;
}

/**
 * A link to one invoice, or undefined before the environment is known.
 *
 * Undefined rather than a guessed host: a link to the wrong company's books is worse
 * than no link, because it looks authoritative.
 */
export function invoiceAppUrl(invoiceId: string | undefined): string | undefined {
  if (environment === undefined || invoiceId === undefined || !/^[0-9]+$/.test(invoiceId)) return undefined;
  return `${APP_HOSTS[environment]}/app/invoice?txnId=${encodeURIComponent(invoiceId)}`;
}
