/**
 * NOT upstream code.
 *
 * Occupies the import path all 141 vendored handlers use
 * (`../helpers/format-error.js`) so none of them need editing. The implementation
 * lives in src/runtime/qbo-error.ts, outside the vendored tree.
 *
 * Upstream's version reduces every non-2xx response to
 * `Error: Request failed with status code 401`, discarding the QuickBooks fault
 * body that the transport error carries. See the NOTICE file.
 */
export { formatError } from '../../runtime/qbo-error.js';
