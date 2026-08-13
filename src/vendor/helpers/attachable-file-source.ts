import { lookup } from "dns/promises";
import { createWriteStream } from "fs";
import { randomBytes } from "crypto";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import { Transform } from "stream";
import { fileURLToPath } from "url";
import fs from "fs/promises";
import net from "net";
import os from "os";
import path from "path";

// Extension -> MIME map limited to the file types QBO's /upload endpoint
// accepts. Values intentionally mirror QBO's documented (sometimes
// non-RFC-standard) spellings — see ALLOWED_UPLOAD_CONTENT_TYPES in
// create-quickbooks-attachable.handler.ts, which this map must stay a
// subset of.
const EXT_TO_MIME: Record<string, string> = {
  ".ai": "application/postscript",
  ".eps": "application/postscript",
  ".csv": "text/csv",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpg",
  ".ods": "application/vnd.oasis.opendocument.spreadsheet",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".rtf": "text/rtf",
  ".tif": "image/tif",
  ".txt": "text/plain",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".xml": "text/xml",
};

// Shared no-op for promise rejections we deliberately swallow (best-effort
// cleanup/cancellation where failure is inconsequential).
const swallow = () => undefined;

// Infer a QBO-supported MIME type from the first candidate name that has a
// known extension. Returns null when no candidate matches.
export function inferContentType(...candidateNames: Array<string | undefined>): string | null {
  for (const name of candidateNames) {
    if (!name) continue;
    const ext = path.extname(name).toLowerCase();
    const mime = EXT_TO_MIME[ext];
    if (mime) return mime;
  }
  return null;
}

// ── file_path source ──────────────────────────────────────────────────────

// The server shares a filesystem with its callers (it runs as a local stdio
// subprocess), so OS-native absolute paths are legitimate input — but they
// must stay inside an allowed base directory. Defaults: the user's profile
// directory and the OS temp directory (which together cover OneDrive/
// SharePoint sync roots, Downloads, and agent scratchpad dirs on a standard
// Windows setup). Override with QUICKBOOKS_ATTACHABLE_BASE_DIR — accepts
// multiple directories separated by ";" (Windows PATH style).
function allowedBaseDirs(): string[] {
  const raw = process.env.QUICKBOOKS_ATTACHABLE_BASE_DIR;
  if (raw) {
    return raw
      .split(";")
      .map((d) => d.trim())
      .filter(Boolean);
  }
  return [os.homedir(), os.tmpdir()];
}

// Windows paths are case-insensitive; normalize before containment checks.
/* istanbul ignore next — platform branch: only one arm is reachable per OS */
function normalizeForCompare(p: string): string {
  return process.platform === "win32" ? p.toLowerCase() : p;
}

export interface LocalFileSource {
  path: string;
  size: number;
}

// Denylist layered on top of the base-dir whitelist. The whitelist is
// deliberately broad (the operator's documents live all over the profile
// dir), so specifically deny the places credentials live: dot-directories
// and dotfiles (.ssh, .aws, .env, ...), token stores, and this server's own
// install tree (which holds .env and tokens.json for a QBO company).
const DENIED_BASENAMES = new Set(["tokens.json"]);

// The server's install root (two levels up from this helper, same resolution
// the client uses for .env). Cached realpath, resolved lazily.
let serverRootRealPromise: Promise<string> | null = null;
function serverRootReal(): Promise<string> {
  if (!serverRootRealPromise) {
    const moduleDir = path.dirname(fileURLToPath(import.meta.url));
    // Defensive fallback: the running module's own tree always resolves.
    serverRootRealPromise = fs
      .realpath(path.join(moduleDir, "..", ".."))
      .catch(/* istanbul ignore next */ () => path.join(moduleDir, "..", ".."));
  }
  return serverRootRealPromise;
}

async function deniedReason(realPath: string): Promise<string | null> {
  const segments = realPath.split(path.sep);
  if (segments.some((s) => s.startsWith(".") && s !== "." && s !== "..")) {
    return "dotfiles and dot-directories are not attachable";
  }
  const base = path.basename(realPath).toLowerCase();
  if (base.endsWith(".env") || DENIED_BASENAMES.has(base)) {
    return "credential files are not attachable";
  }
  const rootReal = await serverRootReal();
  const rel = path.relative(normalizeForCompare(rootReal), normalizeForCompare(realPath));
  if (!rel.startsWith("..") && !path.isAbsolute(rel)) {
    return "files inside the MCP server's own directory are not attachable";
  }
  return null;
}

export async function resolveLocalFile(filePath: string, maxBytes: number): Promise<LocalFileSource> {
  // Require absolute paths: a stdio server's CWD is client-launch-dependent,
  // so resolving relative paths against it would be a silent footgun.
  if (!path.isAbsolute(filePath)) {
    throw new Error(`file_path must be an absolute path (got "${filePath}")`);
  }
  // realpath handles native Windows paths (backslashes, spaces, drive
  // letters) as-is and resolves symlinks/junctions so a link inside an
  // allowed base cannot point back out of it.
  let targetReal: string;
  try {
    targetReal = await fs.realpath(filePath);
  } catch {
    throw new Error(`file_path not found or not readable: ${filePath}`);
  }

  let contained = false;
  const basesChecked: string[] = [];
  for (const dir of allowedBaseDirs()) {
    let baseReal: string;
    try {
      baseReal = await fs.realpath(path.resolve(dir));
    } catch {
      continue; // configured base dir doesn't exist — skip it
    }
    basesChecked.push(baseReal);
    const rel = path.relative(normalizeForCompare(baseReal), normalizeForCompare(targetReal));
    if (!rel.startsWith("..") && !path.isAbsolute(rel)) {
      contained = true;
      break;
    }
  }
  if (!contained) {
    throw new Error(
      `file_path is outside the allowed base directories (${basesChecked.join("; ")}). Set QUICKBOOKS_ATTACHABLE_BASE_DIR (";"-separated list) to change them.`
    );
  }

  const denied = await deniedReason(targetReal);
  if (denied) throw new Error(`file_path denied: ${denied}`);

  const stat = await fs.stat(targetReal);
  if (!stat.isFile()) throw new Error(`file_path is not a regular file: ${filePath}`);
  if (stat.size === 0) throw new Error(`file_path is empty: ${filePath}`);
  if (stat.size > maxBytes) {
    throw new Error(`File too large: ${stat.size} bytes exceeds QBO's ${maxBytes} byte (100 MB) upload limit.`);
  }
  return { path: targetReal, size: stat.size };
}

// ── file_url source ───────────────────────────────────────────────────────

// SSRF guard: reject loopback, RFC1918/4193 private ranges, link-local
// (incl. 169.254.169.254 cloud metadata), CGNAT, and unspecified addresses.
// Exported for tests.
// Extract an IPv4 address embedded in an IPv4-compatible (::/96) or NAT64
// (64:ff9b::/96) IPv6 address, in either dotted or hex-group form.
function embeddedV4(lower: string): string | null {
  const isNat64 = lower.startsWith("64:ff9b::");
  const isV4Compat = lower.startsWith("::") && !lower.startsWith("::ffff:");
  if (!isNat64 && !isV4Compat) return null;
  const dotted = lower.match(/((?:\d{1,3}\.){3}\d{1,3})$/);
  if (dotted) return dotted[1];
  const tail = lower.replace(/^64:ff9b::/, "").replace(/^::/, "");
  const groups = tail.split(":").filter(Boolean);
  if (groups.length === 0 || groups.length > 2) return null;
  const [hi, lo] = groups.length === 2 ? groups : ["0", groups[0]];
  const hiN = parseInt(hi, 16);
  const loN = parseInt(lo, 16);
  return `${hiN >> 8}.${hiN & 255}.${loN >> 8}.${loN & 255}`;
}

export function isBlockedIp(ip: string): boolean {
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    if (lower.startsWith("::ffff:")) {
      const v4 = lower.slice("::ffff:".length);
      return net.isIPv4(v4) ? isBlockedIp(v4) : true;
    }
    if (lower === "::1" || lower === "::") return true;
    const embedded = embeddedV4(lower);
    if (embedded) return isBlockedIp(embedded); // ::/96 and 64:ff9b::/96 embeddings
    if (lower.startsWith("fe8") || lower.startsWith("fe9") || lower.startsWith("fea") || lower.startsWith("feb")) return true; // fe80::/10
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // fc00::/7
    return false;
  }
  if (!net.isIPv4(ip)) return true; // unparseable -> treat as blocked
  const [a, b] = ip.split(".").map(Number);
  if (a === 0 || a === 127 || a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

async function assertUrlAllowed(url: URL): Promise<void> {
  if (url.protocol !== "https:") {
    throw new Error(`file_url must use https (got ${url.protocol.replace(":", "")})`);
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, ""); // strip IPv6 brackets
  if (net.isIP(hostname)) {
    if (isBlockedIp(hostname)) throw new Error(`file_url resolves to a blocked address`);
    return;
  }
  // Check every resolved address. Note: the actual fetch performs its own DNS
  // resolution, so a hostile DNS server could in theory answer differently
  // twice (rebinding). Accepted residual risk for a local, single-operator
  // tool; the primary threat here is an LLM being handed an internal URL.
  const addrs = await lookup(hostname, { all: true, verbatim: true });
  if (addrs.length === 0) throw new Error(`file_url hostname did not resolve`);
  for (const { address } of addrs) {
    if (isBlockedIp(address)) throw new Error(`file_url resolves to a blocked address`);
  }
}

function urlFetchTimeoutMs(): number {
  const raw = Number(process.env.QUICKBOOKS_ATTACHABLE_URL_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : 60_000;
}

export interface FetchedFileSource extends LocalFileSource {
  contentTypeHeader: string | null;
  cleanup: () => Promise<void>;
}

// Fetch an HTTPS URL and spool the body to a temp file, enforcing the size
// cap while streaming (memory stays flat regardless of file size). Redirects
// are followed manually (max 3) so every hop passes the SSRF checks.
export async function fetchUrlToTempFile(fileUrl: string, maxBytes: number): Promise<FetchedFileSource> {
  let current: URL;
  try {
    current = new URL(fileUrl);
  } catch {
    throw new Error(`file_url is not a valid URL: ${fileUrl}`);
  }

  const signal = AbortSignal.timeout(urlFetchTimeoutMs());
  let response: Response | null = null;
  for (let hop = 0; hop <= 3; hop++) {
    await assertUrlAllowed(current);
    const res = await fetch(current, {
      redirect: "manual",
      signal,
      headers: { "user-agent": "qbo-mcp-attachable/1.0" },
    });
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) throw new Error(`file_url redirect (${res.status}) missing Location header`);
      if (hop === 3) throw new Error(`file_url exceeded 3 redirects`);
      current = new URL(location, current);
      // Cancel the redirect body without reading it — a hostile server could
      // attach an arbitrarily large body to a 3xx.
      await res.body?.cancel().catch(swallow);
      continue;
    }
    if (!res.ok) throw new Error(`file_url fetch failed: HTTP ${res.status}`);
    response = res;
    break;
  }
  /* istanbul ignore next — defensive: the redirect loop always breaks with a
     response or throws before exhausting its iterations */
  if (!response) throw new Error(`file_url fetch returned no response`);
  if (!response.body) throw new Error(`file_url fetch returned no body`);

  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    await response.body.cancel().catch(swallow);
    throw new Error(`File too large: ${declaredLength} bytes exceeds QBO's ${maxBytes} byte (100 MB) upload limit.`);
  }

  const tempPath = path.join(
    os.tmpdir(),
    `qbo-attach-${process.pid}-${randomBytes(6).toString("hex")}.tmp`
  );
  const cleanup = async () => {
    await fs.unlink(tempPath).catch(swallow);
  };

  let received = 0;
  const capEnforcer = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      received += chunk.length;
      if (received > maxBytes) {
        cb(new Error(`File too large: download exceeded QBO's ${maxBytes} byte (100 MB) upload limit.`));
        return;
      }
      cb(null, chunk);
    },
  });

  try {
    await pipeline(Readable.fromWeb(response.body as any), capEnforcer, createWriteStream(tempPath));
  } catch (err) {
    await cleanup();
    throw err;
  }

  if (received === 0) {
    await cleanup();
    throw new Error(`file_url returned an empty body`);
  }

  return {
    path: tempPath,
    size: received,
    contentTypeHeader: response.headers.get("content-type"),
    cleanup,
  };
}
