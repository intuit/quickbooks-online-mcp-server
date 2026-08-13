/**
 * NOT upstream code.
 *
 * This file occupies the import path that all 141 vendored handlers use
 * (`../clients/quickbooks-client.js`) so that none of them need editing. It only
 * re-exports; the implementation lives in src/runtime/qbo-client.ts, outside the
 * vendored tree, so re-syncing with upstream stays a copy operation.
 *
 * Upstream's own clients/quickbooks-client.ts is deliberately not vendored — see
 * the NOTICE file for why.
 */
export { QuickbooksClient, type QboAuthCredentials } from "../../runtime/qbo-client.js";
