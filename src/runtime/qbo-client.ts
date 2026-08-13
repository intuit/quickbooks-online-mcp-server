import QuickBooks from "node-quickbooks";
import { installQboTransportPolicy } from "./qbo-transport.js";
import { currentTenant, type QboEnvironment } from "./tenant-context.js";

/**
 * Replacement for upstream's src/clients/quickbooks-client.ts.
 *
 * Upstream builds one QuickBooks instance from process.env at module load and
 * hands it to every handler, which fixes the process to a single company and
 * makes the server capable of starting an interactive OAuth flow. This version
 * keeps the same two static entry points the 141 vendored handlers call, but
 * resolves the company and token from the request's tenant scope and performs no
 * authentication work at all: acquiring and refreshing tokens belongs to the
 * calling API, which already stores them per user.
 *
 * Deliberately absent: dotenv, filesystem credentials, browser OAuth, refresh
 * tokens, and any cross-request state.
 */

/** Pinned so responses do not drift when Intuit changes the default schema. */
const MINOR_VERSION = "75";

/** node-quickbooks only uses these for token refresh, which we never do here. */
const UNUSED_CONSUMER_KEY = "";
const UNUSED_CONSUMER_SECRET = "";

const DEFAULT_REQUEST_TIMEOUT_MS = 20_000;

export interface QboAuthCredentials {
  accessToken: string;
  realmId: string;
  isSandbox: boolean;
}

function isSandbox(environment: QboEnvironment): boolean {
  return environment === "sandbox";
}

/**
 * Same shape upstream's handlers import. Instances are per request and hold no
 * state worth reusing: the constructor only stores configuration, so building
 * one per call is cheaper than any cache that would have to be invalidated when
 * a token rotates.
 */
export class QuickbooksClient {
  /** Called by all 141 vendored handlers. */
  static async getInstance(): Promise<QuickBooks> {
    const tenant = currentTenant();
    // Idempotent, and here rather than only at startup so a vendored handler cannot
    // reach QuickBooks through an unpoliced transport.
    installQboTransportPolicy(DEFAULT_REQUEST_TIMEOUT_MS);

    return new QuickBooks(
      UNUSED_CONSUMER_KEY,
      UNUSED_CONSUMER_SECRET,
      tenant.accessToken,
      false, // no token secret under OAuth 2.0
      tenant.realmId,
      isSandbox(tenant.environment),
      false, // debug logging off: it prints entity bodies to stdout
      MINOR_VERSION,
      "2.0", // OAuth version; anything else makes the library sign requests itself
      undefined, // no refresh token: this service must never refresh
    );
  }

  /**
   * Used by the vendored attachable handler for endpoints node-quickbooks does
   * not wrap. Returns the tenant's own credentials, never ambient ones.
   */
  static async getAuthCredentials(): Promise<QboAuthCredentials> {
    const tenant = currentTenant();
    return {
      accessToken: tenant.accessToken,
      realmId: tenant.realmId,
      isSandbox: isSandbox(tenant.environment),
    };
  }
}
