/**
 * QBO returns `TempDownloadUri` on every Attachable: a multi-KB pre-signed URL
 * carrying an embedded auth blob. Three reasons not to hand it back by default:
 *
 *  - it is bulky — a handful of attachments is tens of KB of opaque query
 *    string, which is pure noise in an LLM's context;
 *  - it is credential-shaped, and short-lived, so it ages into a dead end;
 *  - it invites callers to try fetching it themselves, which is the long way
 *    round now that download_attachment fetches the bytes server-side.
 *
 * Tools therefore strip it unless the caller explicitly opts in with
 * `return_download_uri: true`.
 */
export const DOWNLOAD_URI_FIELDS = ["TempDownloadUri"] as const;

/** Recursively remove download URIs from an arbitrary QBO response value. */
export function stripDownloadUris(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripDownloadUris);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if ((DOWNLOAD_URI_FIELDS as readonly string[]).includes(k)) continue;
      out[k] = stripDownloadUris(v);
    }
    return out;
  }
  return value;
}

/** Apply the default-strip policy: keep URIs only when the caller asked. */
export function applyDownloadUriPolicy(result: unknown, returnDownloadUri: unknown): unknown {
  return returnDownloadUri === true ? result : stripDownloadUris(result);
}
