import type { IncomingMessage, ServerResponse } from "node:http";
import type { ServiceConfig } from "./config.js";
import { callerIsTrusted, fingerprint, sendJson } from "./http-helpers.js";
import { log } from "./logger.js";
import { takePdfForDownload } from "./pdf-handles.js";

/**
 * Redeems a PDF handle issued by get_invoice_pdf.
 *
 * Still behind the service token, even though the handle is unguessable and
 * single-use: a link lands in access logs and chat transcripts, and an invoice PDF
 * carries a customer's name, address and amounts. So our API fetches it and
 * decides who may see it, rather than this service being a document endpoint
 * anyone on the network can hit.
 *
 * Unknown handle, expired handle and wrong company all answer 404 identically, so
 * the route reveals nothing about what exists.
 */

/** GET /v1/pdf/{realmId}/{handle} */
export const PDF_PATH_PATTERN = /^\/v1\/pdf\/([^/?#]+)\/([^/?#]+)$/;

export function servePdf(input: {
  request: IncomingMessage;
  response: ServerResponse;
  config: ServiceConfig;
  realmId: string;
  handle: string;
}): void {
  const { request, response, config } = input;

  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    sendJson(response, 405, { error: "method_not_allowed" });
    return;
  }
  if (!callerIsTrusted(request, config.serviceToken)) {
    sendJson(response, 401, { error: "unauthorized" });
    return;
  }

  const realmId = decodeURIComponent(input.realmId);
  const taken = takePdfForDownload(realmId, decodeURIComponent(input.handle));
  if (!taken) {
    sendJson(response, 404, { error: "not_found" });
    return;
  }

  log.info("pdf_download_redeemed", { realm: fingerprint(realmId), bytes: taken.bytes.length });

  response.writeHead(200, {
    "content-type": "application/pdf",
    "content-length": taken.bytes.length,
    "content-disposition": `attachment; filename="invoice-${taken.invoiceId}.pdf"`,
    // A single-use capability must never be stored by a proxy or a browser.
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  response.end(taken.bytes);
}
