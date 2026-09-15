import { QuickbooksClient } from "../clients/quickbooks-client.js";
import { ToolResponse } from "../types/tool-response.js";
import { formatError } from "../helpers/format-error.js";

// QBO's TempDownloadUri is pre-signed (it carries its own auth blob and needs
// no Authorization header), but it is still a URL taken from a response body,
// so the host is pinned before fetching. A compromised or spoofed response must
// not be able to make this server fetch an arbitrary address.
const ALLOWED_DOWNLOAD_HOST_SUFFIXES = [".intuit.com", ".intuitcdn.net"];

// QBO caps attachments at 100 MB; refuse anything larger rather than buffering
// an unbounded response into memory.
const DEFAULT_MAX_DOWNLOAD_BYTES = 100 * 1024 * 1024;

// Overridable so the caps are actually reachable from tests without allocating
// a 100 MB buffer, and so an operator can tighten them.
function maxDownloadBytes(): number {
  const raw = Number(process.env.QBO_ATTACHMENT_MAX_BYTES);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_MAX_DOWNLOAD_BYTES;
}

// Redirects are followed by hand so each hop can be re-pinned to an Intuit host.
const MAX_DOWNLOAD_REDIRECTS = 3;

function downloadTimeoutMs(): number {
  const raw = Number(process.env.QBO_ATTACHMENT_DOWNLOAD_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : 60_000;
}

export function assertAllowedDownloadHost(rawUrl: string): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("QuickBooks returned a download link that is not a valid URL.");
  }
  if (url.protocol !== "https:") {
    throw new Error("QuickBooks returned a non-HTTPS download link; refusing to fetch it.");
  }
  const host = url.hostname.toLowerCase();
  const ok = ALLOWED_DOWNLOAD_HOST_SUFFIXES.some((s) => host === s.slice(1) || host.endsWith(s));
  if (!ok) {
    throw new Error(`Refusing to fetch an attachment from an unexpected host: ${host}`);
  }
  return url;
}

export interface DownloadAttachmentResult {
  attachableId: string;
  fileName: string;
  contentType: string;
  bytes: number;
  /** Populated when the bytes were written to disk. */
  path?: string;
  /** Populated when the caller asked for the bytes inline. */
  base64?: string;
  attachedTo?: { type?: string; id?: string };
}

/**
 * Fetch an attachment's BYTES from QuickBooks.
 *
 * The other direction (create_attachable) has streamed file upload, but there
 * was no way to read a document back out: the attachable tools return QBO's
 * signed link, which an assistant without shell access cannot consume. This
 * closes that asymmetry by doing the fetch server-side.
 */
export async function downloadQuickbooksAttachment(data: {
  attachable_id: string;
}): Promise<ToolResponse<{ meta: DownloadAttachmentResult; buffer: Buffer }>> {
  try {
    const quickbooks = await QuickbooksClient.getInstance();
    const attachable: any = await new Promise((resolve, reject) => {
      (quickbooks as any).getAttachable(data.attachable_id, (err: any, found: any) =>
        err ? reject(err) : resolve(found)
      );
    });

    if (!attachable) {
      return { result: null, isError: true, error: `Attachable ${data.attachable_id} not found.` };
    }
    const uri = attachable.TempDownloadUri;
    if (!uri) {
      return {
        result: null,
        isError: true,
        error:
          `Attachable ${data.attachable_id} has no downloadable file ` +
          `(metadata-only attachment, or QuickBooks returned no download link).`,
      };
    }

    // Follow redirects MANUALLY so the host pin applies to every hop. With
    // fetch's default redirect:"follow" the check below would only ever cover
    // hop 0, and a 302 could walk the fetch to an arbitrary host.
    const signal = AbortSignal.timeout(downloadTimeoutMs());
    let current = assertAllowedDownloadHost(String(uri));
    let response: Response | null = null;
    for (let hop = 0; hop <= MAX_DOWNLOAD_REDIRECTS; hop++) {
      const hopResponse = await fetch(current, { redirect: "manual", signal });
      if (hopResponse.status >= 300 && hopResponse.status < 400) {
        const location = hopResponse.headers.get("location");
        await hopResponse.body?.cancel().catch(() => undefined);
        if (!location) {
          return {
            result: null,
            isError: true,
            error: `Attachment download redirected (${hopResponse.status}) without a Location header.`,
          };
        }
        if (hop === MAX_DOWNLOAD_REDIRECTS) {
          return {
            result: null,
            isError: true,
            error: `Attachment download exceeded ${MAX_DOWNLOAD_REDIRECTS} redirects.`,
          };
        }
        // Re-pin on every hop; a redirect target is as untrusted as the first.
        current = assertAllowedDownloadHost(new URL(location, current).toString());
        continue;
      }
      response = hopResponse;
      break;
    }
    /* istanbul ignore next — the loop always breaks with a response or returns */
    if (!response) {
      return { result: null, isError: true, error: "Attachment download returned no response." };
    }
    if (!response.ok) {
      // The link is short-lived; an expired one is the most likely 4xx and is
      // worth calling out, since re-reading the attachable mints a fresh one.
      return {
        result: null,
        isError: true,
        error:
          `Downloading attachment ${data.attachable_id} failed (HTTP ${response.status}). ` +
          `QuickBooks download links are short-lived — retry to mint a fresh one.`,
      };
    }

    const cap = maxDownloadBytes();
    // Check the declared size BEFORE buffering, so an oversized file is refused
    // without reading it into memory.
    const declared = Number(response.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > cap) {
      return {
        result: null,
        isError: true,
        error: `Attachment is ${declared} bytes, over the ${cap} byte limit.`,
      };
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    // Belt and braces: a missing or lying content-length must not get past the
    // cap either.
    if (buffer.length > cap) {
      return {
        result: null,
        isError: true,
        error: `Attachment is ${buffer.length} bytes, over the ${cap} byte limit.`,
      };
    }

    const ref = attachable.AttachableRef?.[0]?.EntityRef;
    return {
      result: {
        meta: {
          attachableId: String(attachable.Id ?? data.attachable_id),
          fileName: String(attachable.FileName ?? `attachment-${data.attachable_id}`),
          contentType: String(
            attachable.ContentType ?? response.headers.get("content-type") ?? "application/octet-stream"
          ),
          bytes: buffer.length,
          attachedTo: ref ? { type: ref.type, id: ref.value } : undefined,
        },
        buffer,
      },
      isError: false,
      error: null,
    };
  } catch (error) {
    return { result: null, isError: true, error: formatError(error) };
  }
}
