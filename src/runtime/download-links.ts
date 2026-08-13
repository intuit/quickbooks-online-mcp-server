/**
 * Builds the download target a PDF tool hands back.
 *
 * The path is always returned. An absolute URL is returned only when the
 * deployment has told the service its own externally reachable origin, because a
 * service cannot infer that from a request it received behind a proxy without
 * trusting Host or X-Forwarded-* headers — and trusting those lets a caller
 * choose the origin in the link we hand to a user.
 */

/** Realm and handle both come from trusted sources, but encode anyway. */
export function pdfDownloadPath(realmId: string, handle: string): string {
  return `/v1/pdf/${encodeURIComponent(realmId)}/${encodeURIComponent(handle)}`;
}

let publicBaseUrl: string | undefined;

export function configureDownloadLinks(baseUrl: string | undefined): void {
  publicBaseUrl = baseUrl;
}

export interface DownloadTarget {
  readonly path: string;
  /** Absent when the deployment has not declared its public origin. */
  readonly url?: string;
}

export function pdfDownloadTarget(realmId: string, handle: string): DownloadTarget {
  const path = pdfDownloadPath(realmId, handle);
  if (publicBaseUrl === undefined) return { path };
  return { path, url: `${publicBaseUrl.replace(/\/+$/, "")}${path}` };
}
