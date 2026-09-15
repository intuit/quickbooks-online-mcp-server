/**
 * Regression tests for reading files back OUT of QuickBooks.
 *
 * create_attachable could stream files IN, but nothing fetched the bytes back:
 * the attachable tools returned a signed link, which an assistant without shell
 * access cannot consume. These cover the download path, its guards, and the
 * default-strip policy for those signed links.
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  mockQuickbooksClient,
  mockQuickbooksClientClass,
  mockQuickBooksInstance,
  resetAllMocks,
} from '../../mocks/quickbooks.mock';

jest.unstable_mockModule('../../../src/clients/quickbooks-client', () => ({
  quickbooksClient: mockQuickbooksClient,
  QuickbooksClient: mockQuickbooksClientClass,
}));

const { downloadQuickbooksAttachment, assertAllowedDownloadHost } = await import(
  '../../../src/handlers/download-quickbooks-attachment.handler'
);
const { DownloadAttachmentTool, resolveAttachmentPath, safeFileName } = await import(
  '../../../src/tools/download-attachment.tool'
);
const { stripDownloadUris, applyDownloadUriPolicy } = await import('../../../src/helpers/download-uri');

const PDF = Buffer.from('%PDF-1.4 invoice bytes');
const SIGNED =
  'https://financialdocument.platform.intuit.com/v2/no-user-cred/documents/abc/sources/1?intuit_apikey=secret';

const attachable = (over: Record<string, unknown> = {}) => ({
  Id: '1000001541',
  FileName: 'vendor-invoice.pdf',
  ContentType: 'application/pdf',
  Size: PDF.length,
  TempDownloadUri: SIGNED,
  AttachableRef: [{ EntityRef: { value: '24238', type: 'Bill' } }],
  ...over,
});

let fetchSpy: any;
const mockFetch = (impl: any) => {
  fetchSpy = jest.spyOn(globalThis, 'fetch' as any).mockImplementation(impl);
};
const okResponse = (buf: Buffer, type = 'application/pdf') => ({
  ok: true,
  status: 200,
  headers: {
    get: (h: string) =>
      h === 'content-type' ? type : h === 'content-length' ? String(buf.length) : null,
  },
  arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
});

let outDir: string;
beforeEach(() => {
  resetAllMocks();
  outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qbo-dl-test-'));
  process.env.QBO_ATTACHMENT_OUTPUT_DIR = outDir;
});
afterEach(() => {
  fetchSpy?.mockRestore();
  delete process.env.QBO_ATTACHMENT_OUTPUT_DIR;
  fs.rmSync(outDir, { recursive: true, force: true });
});

describe('downloadQuickbooksAttachment', () => {
  it('fetches the bytes server-side and reports the file metadata', async () => {
    mockQuickBooksInstance.getAttachable.mockImplementation((_id: any, cb: any) => cb(null, attachable()));
    mockFetch(async () => okResponse(PDF));

    const res = await downloadQuickbooksAttachment({ attachable_id: '1000001541' });

    expect(res.isError).toBe(false);
    expect(res.result!.buffer.toString()).toBe(PDF.toString());
    expect(res.result!.meta).toMatchObject({
      fileName: 'vendor-invoice.pdf',
      contentType: 'application/pdf',
      bytes: PDF.length,
      attachedTo: { type: 'Bill', id: '24238' },
    });
  });

  it('explains that the signed link is short-lived when it has expired', async () => {
    mockQuickBooksInstance.getAttachable.mockImplementation((_id: any, cb: any) => cb(null, attachable()));
    mockFetch(async () => ({ ok: false, status: 403, headers: { get: () => null } }));

    const res = await downloadQuickbooksAttachment({ attachable_id: '1' });
    expect(res.isError).toBe(true);
    expect(res.error).toMatch(/403/);
    expect(res.error).toMatch(/short-lived/);
  });

  it('reports a metadata-only attachable rather than failing obscurely', async () => {
    mockQuickBooksInstance.getAttachable.mockImplementation((_id: any, cb: any) =>
      cb(null, attachable({ TempDownloadUri: undefined }))
    );
    const res = await downloadQuickbooksAttachment({ attachable_id: '1' });
    expect(res.isError).toBe(true);
    expect(res.error).toMatch(/no downloadable file/);
  });

  it('re-pins the host on EVERY redirect hop, not just the first', async () => {
    // fetch's default redirect:'follow' would hand hop 0 the check and let a
    // 302 walk the download to any host at all.
    mockQuickBooksInstance.getAttachable.mockImplementation((_id: any, cb: any) => cb(null, attachable()));
    mockFetch(async (u: any) => {
      const href = String(u);
      if (href.includes('intuit.com')) {
        return {
          status: 302,
          ok: false,
          headers: { get: (h: string) => (h === 'location' ? 'https://evil.example.com/payload' : null) },
          body: { cancel: async () => undefined },
        };
      }
      return okResponse(Buffer.from('malicious'));
    });

    const res = await downloadQuickbooksAttachment({ attachable_id: '1' });
    expect(res.isError).toBe(true);
    expect(res.error).toMatch(/unexpected host/);
  });

  it('follows a redirect that stays on an allowed host', async () => {
    mockQuickBooksInstance.getAttachable.mockImplementation((_id: any, cb: any) => cb(null, attachable()));
    let hop = 0;
    mockFetch(async () => {
      if (hop++ === 0) {
        return {
          status: 302,
          ok: false,
          headers: { get: (h: string) => (h === 'location' ? 'https://cdn.intuitcdn.net/doc' : null) },
          body: { cancel: async () => undefined },
        };
      }
      return okResponse(PDF);
    });
    const res = await downloadQuickbooksAttachment({ attachable_id: '1' });
    expect(res.isError).toBe(false);
    expect(res.result!.buffer.toString()).toBe(PDF.toString());
  });

  it('pins the download host so a spoofed link cannot redirect the fetch', () => {
    expect(() => assertAllowedDownloadHost(SIGNED)).not.toThrow();
    expect(() => assertAllowedDownloadHost('https://evil.example.com/x')).toThrow(/unexpected host/);
    expect(() => assertAllowedDownloadHost('http://financialdocument.platform.intuit.com/x')).toThrow(
      /non-HTTPS/
    );
    // A host merely CONTAINING the allowed name must not pass.
    expect(() => assertAllowedDownloadHost('https://intuit.com.evil.example/x')).toThrow(/unexpected host/);
  });
});

describe('download_attachment tool', () => {
  const run = (params: any) => (DownloadAttachmentTool.handler as any)({ params });

  it('saves the file and returns a path that can be opened', async () => {
    mockQuickBooksInstance.getAttachable.mockImplementation((_id: any, cb: any) => cb(null, attachable()));
    mockFetch(async () => okResponse(PDF));

    const out = await run({ attachable_id: '1000001541' });
    const meta = JSON.parse(out.content[1].text);

    // Default name carries the attachable id so concurrent downloads of two
    // vendors' "invoice.pdf" cannot collide.
    expect(meta.path).toBe(path.join(fs.realpathSync(outDir), '1000001541-vendor-invoice.pdf'));
    expect(fs.readFileSync(meta.path).toString()).toBe(PDF.toString());
  });

  it('refuses to overwrite silently', async () => {
    mockQuickBooksInstance.getAttachable.mockImplementation((_id: any, cb: any) => cb(null, attachable()));
    mockFetch(async () => okResponse(PDF));
    await run({ attachable_id: '1' });

    const second = await run({ attachable_id: '1' });
    expect(second.content[0].text).toMatch(/already exists/);

    const third = await run({ attachable_id: '1', overwrite: true });
    expect(third.content[0].text).toMatch(/saved/);
  });

  it('returns base64 when asked inline, and refuses oversized inline', async () => {
    mockQuickBooksInstance.getAttachable.mockImplementation((_id: any, cb: any) => cb(null, attachable()));
    mockFetch(async () => okResponse(PDF));
    const inline = await run({ attachable_id: '1', inline: true });
    expect(Buffer.from(inline.content[1].text, 'base64').toString()).toBe(PDF.toString());

    const big = Buffer.alloc(5 * 1024 * 1024, 1);
    mockFetch(async () => okResponse(big));
    const refused = await run({ attachable_id: '1', inline: true });
    expect(refused.content[0].text).toMatch(/Refusing to return/);
  });

  it('refuses to write through a SYMLINK at the destination', async () => {
    mockQuickBooksInstance.getAttachable.mockImplementation((_id: any, cb: any) => cb(null, attachable()));
    mockFetch(async () => okResponse(PDF));

    const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qbo-outside-'));
    const victim = path.join(outsideDir, 'victim.txt');
    fs.writeFileSync(victim, 'original');
    const linkPath = path.join(fs.realpathSync(outDir), 'link.pdf');
    let symlinked = true;
    try {
      fs.symlinkSync(victim, linkPath);
    } catch {
      symlinked = false; // Windows without developer mode
    }

    if (symlinked) {
      const res = await run({ attachable_id: '1', output_path: 'link.pdf', overwrite: true });
      expect(res.content[0].text).toMatch(/symbolic link/);
      expect(fs.readFileSync(victim).toString()).toBe('original'); // untouched
    }
    fs.rmSync(outsideDir, { recursive: true, force: true });
  });

  it('prefixes the default name with the attachable id so downloads cannot collide', async () => {
    mockQuickBooksInstance.getAttachable.mockImplementation((_id: any, cb: any) =>
      cb(null, attachable({ Id: '777', FileName: 'invoice.pdf' }))
    );
    mockFetch(async () => okResponse(PDF));
    const out = await run({ attachable_id: '777' });
    expect(JSON.parse(out.content[1].text).path).toBe(
      path.join(fs.realpathSync(outDir), '777-invoice.pdf')
    );
  });

  it('sanitises output_path too, not just the QBO file name', async () => {
    mockQuickBooksInstance.getAttachable.mockImplementation((_id: any, cb: any) => cb(null, attachable()));
    mockFetch(async () => okResponse(PDF));
    const out = await run({ attachable_id: '1', output_path: '../../escape.pdf' });
    expect(JSON.parse(out.content[1].text).path).toBe(
      path.join(fs.realpathSync(outDir), 'escape.pdf')
    );
  });

  it('keeps a malicious file name or output_path inside the output directory', () => {
    const root = fs.realpathSync(outDir);
    expect(safeFileName('../../etc/passwd')).toBe('passwd');
    expect(safeFileName('a/b/c.pdf')).toBe('c.pdf');
    expect(resolveAttachmentPath('../escape.pdf', root)).toEqual({
      error: expect.stringContaining('".." segments'),
    });
    expect(resolveAttachmentPath(path.join(root, 'abs.pdf'), root)).toEqual({
      error: expect.stringContaining('must be relative'),
    });
    expect(resolveAttachmentPath('fine.pdf', root)).toEqual({
      absolutePath: path.join(root, 'fine.pdf'),
    });
  });
});

describe('signed-link strip policy', () => {
  it('removes TempDownloadUri anywhere in a response by default', () => {
    const stripped: any = stripDownloadUris([attachable(), { nested: { TempDownloadUri: SIGNED, keep: 1 } }]);
    expect(JSON.stringify(stripped)).not.toContain('intuit_apikey');
    expect(stripped[0].FileName).toBe('vendor-invoice.pdf'); // everything else intact
    expect(stripped[1].nested.keep).toBe(1);
  });

  it('keeps the link only when the caller explicitly opts in', () => {
    expect(JSON.stringify(applyDownloadUriPolicy([attachable()], undefined))).not.toContain('intuit_apikey');
    expect(JSON.stringify(applyDownloadUriPolicy([attachable()], false))).not.toContain('intuit_apikey');
    expect(JSON.stringify(applyDownloadUriPolicy([attachable()], true))).toContain('intuit_apikey');
  });
});

// ── the leak this change exists to close, tested on the TOOLS themselves ─────
// Testing the helper alone left the wiring untested: the strip could be removed
// from any individual tool and the suite would stay green.
describe('every attachable tool strips signed links by default', () => {
  const withUri = { ...attachable(), TempDownloadUri: SIGNED };

  it('get_attachable', async () => {
    const { GetAttachableTool } = await import('../../../src/tools/get-attachable.tool');
    mockQuickBooksInstance.getAttachable.mockImplementation((_i: any, cb: any) => cb(null, withUri));
    const off = await (GetAttachableTool.handler as any)({ params: { id: '1' } });
    expect(JSON.stringify(off)).not.toContain('intuit_apikey');
    const on = await (GetAttachableTool.handler as any)({ params: { id: '1', return_download_uri: true } });
    expect(JSON.stringify(on)).toContain('intuit_apikey');
  });

  it('search_attachables', async () => {
    const { SearchAttachablesTool } = await import('../../../src/tools/search-attachables.tool');
    mockQuickBooksInstance.findAttachables.mockImplementation((_c: any, cb: any) =>
      cb(null, { QueryResponse: { Attachable: [withUri] } })
    );
    const off = await (SearchAttachablesTool.handler as any)({ params: {} });
    expect(JSON.stringify(off)).not.toContain('intuit_apikey');
    const on = await (SearchAttachablesTool.handler as any)({ params: { return_download_uri: true } });
    expect(JSON.stringify(on)).toContain('intuit_apikey');
  });


  it('update_attachable', async () => {
    const { UpdateAttachableTool } = await import('../../../src/tools/update-attachable.tool');
    mockQuickBooksInstance.updateAttachable.mockImplementation((_p: any, cb: any) => cb(null, withUri));
    mockQuickBooksInstance.getAttachable.mockImplementation((_i: any, cb: any) => cb(null, withUri));
    const off = await (UpdateAttachableTool.handler as any)({ params: { id: '1', sync_token: '0' } });
    expect(JSON.stringify(off)).not.toContain('intuit_apikey');
  });
});

describe('download size caps', () => {
  it('refuses an oversized file from the declared content-length, before buffering', async () => {
    process.env.QBO_ATTACHMENT_MAX_BYTES = '100';
    mockQuickBooksInstance.getAttachable.mockImplementation((_i: any, cb: any) => cb(null, attachable()));
    let buffered = false;
    mockFetch(async () => ({
      ok: true,
      status: 200,
      headers: { get: (h: string) => (h === 'content-length' ? '999999' : null) },
      arrayBuffer: async () => {
        buffered = true;
        return Buffer.alloc(0).buffer;
      },
    }));
    const res = await downloadQuickbooksAttachment({ attachable_id: '1' });
    expect(res.isError).toBe(true);
    expect(res.error).toMatch(/over the 100 byte limit/);
    expect(buffered).toBe(false); // refused without reading the body
    delete process.env.QBO_ATTACHMENT_MAX_BYTES;
  });

  it('still refuses when content-length lies or is missing', async () => {
    process.env.QBO_ATTACHMENT_MAX_BYTES = '10';
    mockQuickBooksInstance.getAttachable.mockImplementation((_i: any, cb: any) => cb(null, attachable()));
    const big = Buffer.alloc(50, 7);
    mockFetch(async () => ({
      ok: true,
      status: 200,
      headers: { get: () => null }, // no content-length at all
      arrayBuffer: async () => big.buffer.slice(big.byteOffset, big.byteOffset + big.byteLength),
    }));
    const res = await downloadQuickbooksAttachment({ attachable_id: '1' });
    expect(res.isError).toBe(true);
    expect(res.error).toMatch(/over the 10 byte limit/);
    delete process.env.QBO_ATTACHMENT_MAX_BYTES;
  });
});

describe('safeFileName sanitisation', () => {
  it('strips control and reserved characters and falls back for empty names', () => {
    expect(safeFileName('in\nvoice\t.pdf')).toBe('in_voice_.pdf');
    expect(safeFileName('a:b*c?d"e<f>g|h.pdf')).toBe('a_b_c_d_e_f_g_h.pdf');
    expect(safeFileName('')).toBe('attachment');
    expect(safeFileName('.')).toBe('attachment');
    expect(safeFileName('..')).toBe('attachment');
    expect(safeFileName('   ')).toBe('attachment');
    // Windows-style path: backslashes are normalised before basename, so only
    // the file name survives.
    expect(safeFileName('C:\\Windows\\System32\\evil.dll')).toBe('evil.dll');
  });
});
