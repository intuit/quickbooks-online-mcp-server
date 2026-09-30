import { QuickbooksClient } from "../clients/quickbooks-client.js";
import { ToolResponse } from "../types/tool-response.js";
import { formatError } from "./format-error.js";

/**
 * A QBO transaction whose PDF can be emailed through the native
 * `POST /v3/company/{realmId}/{entity}/{id}/send[?sendTo=]` endpoint.
 */
export interface SendableTransaction {
  /** Human-readable entity name used in messages, e.g. "Invoice". */
  label: string;
  /** node-quickbooks reader for the entity, e.g. "getInvoice". */
  getMethod: string;
  /** node-quickbooks sender for the entity, e.g. "sendInvoicePdf". */
  sendMethod: string;
}

export interface SendTransactionOptions {
  /** Recipient override. QBO also writes it into the entity's BillEmail. */
  sendTo?: string;
  /** Send even when the entity's EmailStatus is already EmailSent. */
  allowResend?: boolean;
}

/** Promisify a node-quickbooks `(…args, callback)` method. */
function callQbo(quickbooks: any, method: string, ...args: unknown[]): Promise<any> {
  return new Promise((resolve, reject) => {
    quickbooks[method](...args, (err: any, data: any) => (err ? reject(err) : resolve(data)));
  });
}

/**
 * Email a transaction PDF to the customer from QuickBooks Online.
 *
 * The entity is read first because QBO does not deduplicate `/send`: a retried
 * call emails the customer again. An entity whose EmailStatus is already
 * EmailSent is refused unless `allowResend` is set. The read also turns a
 * missing recipient (no send_to and no BillEmail) into a clear error instead of
 * a QBO validation fault.
 *
 * `sendTo` is URL-encoded before it reaches node-quickbooks, which appends it
 * to the query string verbatim: an unencoded "+" would reach QBO as a space.
 */
export async function sendTransactionPdf(
  entity: SendableTransaction,
  id: string,
  options: SendTransactionOptions
): Promise<ToolResponse<any>> {
  const { sendTo, allowResend = false } = options;
  try {
    const quickbooks = await QuickbooksClient.getInstance();
    const current = await callQbo(quickbooks, entity.getMethod, id);

    if (!allowResend && current?.EmailStatus === "EmailSent") {
      return {
        result: null,
        isError: true,
        error:
          `${entity.label} ${id} was already emailed (EmailStatus=EmailSent). QuickBooks does ` +
          `not deduplicate sends, so it was NOT sent again. Pass allow_resend: true only if ` +
          `the user explicitly asked to send it again.`,
      };
    }

    if (!sendTo && !current?.BillEmail?.Address) {
      return {
        result: null,
        isError: true,
        error:
          `${entity.label} ${id} has no BillEmail address, so there is no recipient. ` +
          `Nothing was sent. Pass send_to with the address the user provided.`,
      };
    }

    const encodedSendTo = sendTo ? encodeURIComponent(sendTo) : undefined;
    const sent = await callQbo(quickbooks, entity.sendMethod, id, encodedSendTo);
    return { result: sent, isError: false, error: null };
  } catch (error) {
    return { result: null, isError: true, error: formatError(error) };
  }
}
