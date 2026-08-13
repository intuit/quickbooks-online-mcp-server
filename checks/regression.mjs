/**
 * Behaviour checks for this service, run against its own compiled output.
 *
 * Not a unit-test suite and deliberately not a test framework: the repository
 * ships no test dependency, and the things worth asserting here are about what
 * QuickBooks actually receives. So the real tools, the real caches, the real
 * transport policy and the real HTTP routes all run, and only Intuit is stood in
 * for — by a local server that records the URLs and bodies it is sent.
 *
 *   node checks/regression.mjs
 */
import { createServer } from "node:http";
import { createHash, createHmac } from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const serviceRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const requireFromService = createRequire(join(serviceRoot, "package.json"));
const QuickBooks = requireFromService("node-quickbooks");
const dist = join(serviceRoot, "dist/runtime");

const { runInTenantScope } = await import(`${dist}/tenant-context.js`);
const { ALLOWLISTED_TOOLS, assertAllowlistIntegrity, OVERRIDDEN_TOOLS, riskOf, riskForVendoredTool } = await import(
  `${dist}/tool-allowlist.js`
);
const { VENDORED_TOOLS } = await import(`${dist}/vendor-tool-registry.generated.js`);
const { forgetRealm } = await import(`${dist}/cache/reference-cache.js`);
const { TtlCache } = await import(`${dist}/cache/ttl-cache.js`);
const { toPage, resolvePage, MAX_PAGE_BYTES, MAX_PAGE_SIZE } = await import(`${dist}/pagination.js`);
const { readCapabilities, companyCapabilities } = await import(`${dist}/preferences.js`);
const { assertInvoiceFieldsSupported, UnsupportedForCompanyError } = await import(`${dist}/invoice-field-policy.js`);
const { storePdfForDownload, takePdfForDownload, configurePdfHandleStore, pdfHandleStats, DEFAULT_PDF_LIMITS } =
  await import(`${dist}/pdf-handles.js`);
const { configureDownloadLinks } = await import(`${dist}/download-links.js`);
const { signTenantBinding, verifyTenantBinding, BINDING_ERROR_CODES, BINDING_HEADER } = await import(
  `${dist}/tenant-binding.js`
);
const { verifyExecutionAssertion, EXECUTION_ASSERTION_ERROR_CODES, EXECUTION_ASSERTION_HEADER } = await import(
  `${dist}/execution-assertion.js`
);
const { createHttpServer } = await import(`${dist}/http-server.js`);
const { loadConfig } = await import(`${dist}/config.js`);
const {
  configureTransportPolicy,
  transportStats,
  resetTransportPolicyState,
  DEFAULT_TRANSPORT_LIMITS,
  ReadBudgetError,
} = await import(`${dist}/qbo-transport.js`);
const { Semaphore, ConcurrencyLimitError } = await import(`${dist}/concurrency.js`);

let pass = 0;
const failures = [];
function check(name, ok, detail) {
  if (ok) {
    pass += 1;
    console.log(`  ok   ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL ${name}${detail === undefined ? "" : ` — ${detail}`}`);
  }
}
function section(title) {
  console.log(`\n== ${title} ==`);
}

const tool = (name) => ALLOWLISTED_TOOLS.find((t) => t.definition.name === name)?.definition;

// ------------------------------------------------------------------ stand-in Intuit
const REALM_MULTI = "9341457607611149";
const REALM_AST = "1000000000000002";
const REALM_PLAIN = "1000000000000003";
const ACTOR_A = "665f1a2b3c4d5e6f70819200";
const ACTOR_B = "665f1a2b3c4d5e6f70819299";
const CHATBOT = "665f1a2b3c4d5e6f70819201";
const CONNECTOR = "665f1a2b3c4d5e6f70819202";

const PREFERENCES = {
  [REALM_MULTI]: {
    CurrencyPrefs: { MultiCurrencyEnabled: true, HomeCurrency: { value: "USD" } },
    TaxPrefs: { UsingSalesTax: true, PartnerTaxEnabled: false },
    SalesFormsPrefs: { CustomTxnNumbers: true, DefaultTerms: { value: "3" } },
  },
  [REALM_AST]: {
    CurrencyPrefs: { MultiCurrencyEnabled: false, HomeCurrency: { value: "USD" } },
    TaxPrefs: { UsingSalesTax: true, PartnerTaxEnabled: true },
    SalesFormsPrefs: { CustomTxnNumbers: true },
  },
  [REALM_PLAIN]: {
    CurrencyPrefs: { MultiCurrencyEnabled: false, HomeCurrency: { value: "GBP" } },
    TaxPrefs: { UsingSalesTax: false, PartnerTaxEnabled: false },
    SalesFormsPrefs: { CustomTxnNumbers: false },
  },
};

const PDF_BYTES = Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.alloc(2048, 0x41), Buffer.from("\n%%EOF\n")]);

const seen = [];
const creates = [];
let nextInvoiceId = 100;
/** Set to a status to make the next N provider replies fail. */
let failWith = null;
let failCount = 0;
let throttleOnce = false;
let holdMs = 0;
let inFlight = 0;
let peakInFlight = 0;
/** Body of the most recent write, so a "sparse" update can be inspected. */
let lastPostBody = null;
/** How many more times an update should fail with fault 5010 (stale SyncToken). */
let staleTokenTimes = 0;
let syncToken = 3;

const provider = createServer((request, response) => {
  const url = decodeURIComponent(request.url);
  seen.push({ method: request.method, url });
  inFlight += 1;
  peakInFlight = Math.max(peakInFlight, inFlight);

  const finish = (status, headers, body) => {
    const done = () => {
      inFlight -= 1;
      response.writeHead(status, headers);
      response.end(body);
    };
    if (holdMs > 0) setTimeout(done, holdMs);
    else done();
  };

  if (throttleOnce) {
    throttleOnce = false;
    finish(429, { "content-type": "application/json", "retry-after": "0" }, JSON.stringify({ Fault: { Error: [{ code: "3001" }] } }));
    return;
  }
  if (failWith !== null && failCount > 0) {
    failCount -= 1;
    finish(failWith, { "content-type": "application/json" }, JSON.stringify({ Fault: { Error: [{ code: "5000", Message: "boom" }] } }));
    return;
  }

  const realm = url.match(/\/v3\/company\/([0-9]+)\//)?.[1];

  if (url.includes("/preferences")) {
    finish(200, { "content-type": "application/json" }, JSON.stringify({ Preferences: PREFERENCES[realm] ?? {} }));
    return;
  }
  if (url.includes("/companyinfo")) {
    finish(200, { "content-type": "application/json" }, JSON.stringify({ CompanyInfo: { Id: "1", CompanyName: `Company ${realm}` } }));
    return;
  }
  if (/\/invoice\/\d+\/pdf/.test(url)) {
    if (url.includes("/invoice/999/")) {
      finish(200, { "content-type": "application/json" }, JSON.stringify({ Fault: { Error: [{ code: "6240" }] } }));
      return;
    }
    finish(200, { "content-type": "application/pdf" }, PDF_BYTES);
    return;
  }
  if (request.method === "POST" && /\/invoice\/\d+\/send/.test(url)) {
    finish(
      200,
      { "content-type": "application/json" },
      JSON.stringify({ Invoice: { Id: "101", DocNumber: "1001", SyncToken: "4", EmailStatus: "EmailSent" } }),
    );
    return;
  }
  if (request.method === "POST" && /\/invoice(\?|$)/.test(url)) {
    let body = "";
    request.on("data", (chunk) => (body += chunk));
    request.on("end", () => {
      const entity = JSON.parse(body || "{}");
      lastPostBody = entity;

      if (/operation=void/i.test(url)) {
        finish(
          200,
          { "content-type": "application/json" },
          JSON.stringify({ Invoice: { Id: "101", DocNumber: "1001", SyncToken: "5", TotalAmt: 0, PrivateNote: "Voided" } }),
        );
        return;
      }

      // An Id in the body means an update; a create has none.
      if (entity.Id !== undefined) {
        if (staleTokenTimes > 0) {
          staleTokenTimes -= 1;
          syncToken += 1; // somebody else wrote, so the token moved on
          finish(
            400,
            { "content-type": "application/json" },
            JSON.stringify({ Fault: { Error: [{ code: "5010", Message: "Stale Object Error" }] } }),
          );
          return;
        }
        finish(
          200,
          { "content-type": "application/json" },
          JSON.stringify({ Invoice: { Id: entity.Id, DocNumber: "1001", SyncToken: String(syncToken + 1) } }),
        );
        return;
      }

      creates.push({ url, entity });
      nextInvoiceId += 1;
      finish(
        200,
        { "content-type": "application/json" },
        JSON.stringify({ Invoice: { Id: String(nextInvoiceId), DocNumber: `D${nextInvoiceId}`, SyncToken: "0", TotalAmt: 300 } }),
      );
    });
    return;
  }
  // node-quickbooks appends minorversion and format, so the id is not end-of-string.
  if (/\/invoice\/\d+(\?|$)/.test(url)) {
    finish(
      200,
      { "content-type": "application/json" },
      JSON.stringify({ Invoice: { Id: "101", DocNumber: "1001", SyncToken: String(syncToken), TotalAmt: 10, Balance: 10 } }),
    );
    return;
  }
  finish(
    200,
    { "content-type": "application/json" },
    JSON.stringify({
      QueryResponse: {
        Invoice: [
          { Id: "101", DocNumber: "1001", TotalAmt: 10, SyncToken: "3", CustomerRef: { value: "1", name: "Acme" } },
          { Id: "102", DocNumber: "1002", TotalAmt: 20, SyncToken: "4", CustomerRef: { value: "2", name: "Beta" } },
        ],
        Customer: [{ Id: "1", DisplayName: "Acme", SyncToken: "9" }],
        Item: [{ Id: "7", Name: "Consulting", UnitPrice: 150, SyncToken: "2" }],
        Term: [{ Id: "3", Name: "Net 30", DueDays: 30 }],
        TaxCode: [{ Id: "4", Name: "TAX", Taxable: true }],
        maxResults: 2,
      },
    }),
  );
});
await new Promise((resolve) => provider.listen(0, "127.0.0.1", resolve));
QuickBooks.V3_ENDPOINT_BASE_URL = `http://127.0.0.1:${provider.address().port}/v3/company/`;
configureDownloadLinks("https://qbo.example.com");
configurePdfHandleStore(DEFAULT_PDF_LIMITS);
configureTransportPolicy(DEFAULT_TRANSPORT_LIMITS);

const tenantFor = (realmId, actorUserId = ACTOR_A, requestId = `r-${realmId}-${actorUserId}`) => ({
  realmId,
  accessToken: "x".repeat(40),
  environment: "sandbox",
  requestId,
  actorUserId,
  chatbotId: CHATBOT,
  connectorId: CONNECTOR,
});
const call = (realmId, name, params, actor = ACTOR_A, requestId) =>
  runInTenantScope(tenantFor(realmId, actor, requestId), () => tool(name).handler({ params }));
const lastUrl = () => seen[seen.length - 1].url;

// ------------------------------------------------------------------ the tool surface
section("the exposed tool surface");
check("the allowlist is self-consistent", (() => { try { assertAllowlistIntegrity(); return true; } catch { return false; } })());
// The whole vendored surface is exposed. Asserted by derivation rather than a
// literal count, so vendoring a new upstream tool needs no edit here — but
// dropping one still fails.
const expectedToolNames = new Set([...VENDORED_TOOLS.map((t) => t.name), "send_invoice", "void_invoice"]);
check(
  "every vendored tool is exposed, plus the two this service adds",
  ALLOWLISTED_TOOLS.length === expectedToolNames.size,
  `${ALLOWLISTED_TOOLS.length} exposed vs ${expectedToolNames.size} expected`,
);
check(
  "no vendored tool is silently dropped",
  VENDORED_TOOLS.every((t) => tool(t.name) !== undefined),
  VENDORED_TOOLS.filter((t) => tool(t.name) === undefined).map((t) => t.name).slice(0, 5).join(", "),
);
check("delete_invoice is exposed on request", tool("delete_invoice") !== undefined);
check("void_invoice remains the auditable way to cancel", tool("void_invoice") !== undefined);

// The safety-critical property of exposing everything: a hard delete must never be
// classified READ_ONLY, because the calling API auto-executes READ_ONLY with no
// human approval.
const deleteToolNames = VENDORED_TOOLS.map((t) => t.name).filter((n) => n.replace(/-/g, "_").startsWith("delete_"));
check("all 20 delete tools are present to classify", deleteToolNames.length === 20, String(deleteToolNames.length));
check(
  "every delete tool is HIGH_RISK, so none can auto-execute",
  deleteToolNames.every((n) => riskOf(n) === "HIGH_RISK"),
  deleteToolNames.filter((n) => riskOf(n) !== "HIGH_RISK").join(", "),
);
// Eight vendored tools are kebab-case; a `delete_` prefix check alone would miss
// these two and leave hard deletes unclassified.
check(
  "kebab-case delete tools are classified too",
  riskOf("delete-bill") === "HIGH_RISK" && riskOf("delete-vendor") === "HIGH_RISK",
  `delete-bill=${riskOf("delete-bill")} delete-vendor=${riskOf("delete-vendor")}`,
);
check(
  "every create and update tool is at least WRITE",
  VENDORED_TOOLS.map((t) => t.name)
    .filter((n) => /^(create|update)[-_]/.test(n))
    .every((n) => riskOf(n) === "WRITE" || riskOf(n) === "HIGH_RISK"),
);
// An unrecognised verb must fail the boot rather than default to READ_ONLY.
check(
  "an unclassifiable verb throws instead of defaulting",
  (() => {
    try { riskForVendoredTool("exfiltrate_everything"); return false; } catch { return true; }
  })(),
);
check("every read is classified READ_ONLY", ["search_invoices", "read_invoice", "get_customer", "read_item", "search_items", "search_customers", "search_terms", "search_tax_codes", "get_company_info", "get_invoice_pdf", "get_aged_receivables", "get_customer_balance"].every((n) => riskOf(n) === "READ_ONLY"));
check("create, update and void are WRITE", ["create_invoice", "update_invoice", "void_invoice"].every((n) => riskOf(n) === "WRITE"));
check("send is HIGH_RISK", riskOf("send_invoice") === "HIGH_RISK");
check("every overridden tool is present", OVERRIDDEN_TOOLS.every((n) => tool(n) !== undefined));

// ---------------------------------------------------------------- bounded paging
section("bounded paging (P4.1)");
seen.length = 0;
await call(REALM_MULTI, "search_invoices", { limit: 5 });
check("over-fetches exactly one extra row", / maxresults 6/.test(lastUrl()), lastUrl());
check("starts where asked", / startposition 1/.test(lastUrl()));
check("sorts newest first by default", / orderby Id desc/.test(lastUrl()));
check("never asks for everything", !/fetchall/i.test(lastUrl()));

seen.length = 0;
await call(REALM_MULTI, "search_invoices", {
  filters: [{ field: "DocNumber", value: "1001" }, { field: "Balance", value: 0, operator: ">" }, { field: "CustomerRef", value: ["1", "2"], operator: "IN" }],
  sort_by: "TxnDate", sort_dir: "asc", limit: 2, offset: 41,
});
check(
  "renders every operator into the query",
  /DocNumber = '1001'/.test(lastUrl()) && /Balance > 0/.test(lastUrl()) && /CustomerRef IN \('1','2'\)/.test(lastUrl()) && / and /.test(lastUrl()),
  lastUrl(),
);
check("honours an explicit sort and offset", / orderby TxnDate asc/.test(lastUrl()) && / startposition 41/.test(lastUrl()));

const onePage = await call(REALM_MULTI, "search_invoices", { limit: 1 });
const rows = JSON.parse(onePage.content[1].text);
check("returns the requested page size", rows.length === 1);
check("reports the next offset", /next_offset 2/.test(onePage.content[0].text), onePage.content[0].text);
check("rows are projected, not raw entities", !("SyncToken" in rows[0]) && rows[0].doc_number === "1001");
check("one JSON block, not one per row", onePage.content.length === 2);

const fat = Array.from({ length: 100 }, (_, i) => ({ id: String(i), blob: "z".repeat(4000) }));
const trimmed = toPage(fat, resolvePage({ limit: 100 }));
check("a byte budget trims an oversized page", trimmed.rows.length < 100 && trimmed.droppedForSize > 0);
check("the trimmed page fits the budget", Buffer.byteLength(JSON.stringify(trimmed.rows)) <= MAX_PAGE_BYTES);
check("a trimmed page still reports more", trimmed.hasMore && trimmed.nextOffset !== null);
check("the page ceiling is 100", MAX_PAGE_SIZE === 100);

// ----------------------------------------------------------------- per-realm cache
section("per-realm caching (P4.1, P6.2)");
for (const realm of [REALM_MULTI, REALM_AST, REALM_PLAIN]) forgetRealm(realm);
seen.length = 0;
await call(REALM_MULTI, "search_customers", { limit: 5 });
const afterFirst = seen.length;
await call(REALM_MULTI, "search_customers", { limit: 5 });
check("a repeated reference search costs no request", seen.length === afterFirst, String(seen.length - afterFirst));
seen.length = 0;
await call(REALM_AST, "search_customers", { limit: 5 });
check("another company never reuses the entry", seen.length === 1, String(seen.length));
seen.length = 0;
await Promise.all(Array.from({ length: 5 }, () => call(REALM_MULTI, "search_items", { limit: 5 })));
check("five concurrent identical reads collapse to one", seen.length === 1, String(seen.length));
seen.length = 0;
await call(REALM_MULTI, "search_invoices", { limit: 5 });
await call(REALM_MULTI, "search_invoices", { limit: 5 });
check("invoices are deliberately not cached", seen.length === 2, String(seen.length));

let clock = 1000;
const bounded = new TtlCache({ maxEntries: 3, ttlMs: 100, now: () => clock });
bounded.set("a", 1); bounded.set("b", 2); bounded.set("c", 3); bounded.set("d", 4);
check("the entry ceiling holds", bounded.stats().entries === 3);
check("the oldest is evicted", bounded.get("a") === undefined && bounded.get("d") === 4);
clock += 101;
check("entries expire on their TTL", bounded.get("d") === undefined);
const lru = new TtlCache({ maxEntries: 2, ttlMs: 10_000, now: () => clock });
lru.set("x", 1); lru.set("y", 2); lru.get("x"); lru.set("z", 3);
check("eviction is least-recently-used", lru.get("x") === 1 && lru.get("y") === undefined);
let loads = 0;
const failing = new TtlCache({ maxEntries: 4, ttlMs: 10_000 });
await failing.getOrLoad("k", async () => { loads += 1; throw new Error("boom"); }).catch(() => undefined);
await failing.getOrLoad("k", async () => { loads += 1; return 7; });
check("a failed load is never cached", loads === 2 && failing.get("k") === 7);

// ------------------------------------------------------------- company adaptation
section("per-realm preference adaptation (P4.5)");
const multi = await runInTenantScope(tenantFor(REALM_MULTI), companyCapabilities);
const ast = await runInTenantScope(tenantFor(REALM_AST), companyCapabilities);
const plain = await runInTenantScope(tenantFor(REALM_PLAIN), companyCapabilities);
check("multicurrency is read", multi.multicurrency && !ast.multicurrency);
check("automated sales tax is distinguished from manual", ast.automatedSalesTax && !multi.automatedSalesTax && multi.usingSalesTax);
check("tax-off is detected", !plain.usingSalesTax);
check("QuickBooks-assigned numbering is detected", !plain.customTransactionNumbers && multi.customTransactionNumbers);
const empty = readCapabilities({});
check("absent settings default to restrictive", !empty.multicurrency && !empty.usingSalesTax && !empty.customTransactionNumbers);
seen.length = 0;
await runInTenantScope(tenantFor(REALM_MULTI), companyCapabilities);
check("preferences are probed once per company", seen.filter((r) => r.url.includes("/preferences")).length === 0);

const refusal = (fields, caps) => { try { assertInvoiceFieldsSupported(fields, caps); return null; } catch (e) { return e instanceof UnsupportedForCompanyError ? e : new Error(String(e)); } };
check("currency is refused without multicurrency", refusal({ CurrencyRef: { value: "EUR" } }, plain)?.field === "CurrencyRef");
check("and allowed with it", refusal({ CurrencyRef: { value: "EUR" } }, multi) === null);
check("manual tax is refused under automated sales tax", refusal({ TxnTaxDetail: {} }, ast)?.field === "TxnTaxDetail");
check("manual tax is allowed under manual sales tax", refusal({ TxnTaxDetail: {} }, multi) === null);
check("a line tax code is refused when tax is off", refusal({ Line: [{ SalesItemLineDetail: { TaxCodeRef: { value: "TAX" } } }] }, plain) !== null);
check("DocNumber is refused when QuickBooks numbers invoices", refusal({ DocNumber: "555" }, plain)?.field === "DocNumber");
check("unknown settings block only dependent fields", refusal({ DueDate: "2026-09-01" }, null) === null && refusal({ CurrencyRef: { value: "EUR" } }, null) !== null);
const throughTool = await call(REALM_PLAIN, "update_invoice", { invoice_id: "101", patch: { DocNumber: "555" } });
check("update_invoice applies the policy", /numbers its own invoices/.test(throughTool.content[0].text));
seen.length = 0;
await call(REALM_PLAIN, "update_invoice", { invoice_id: "101", patch: { CurrencyRef: { value: "EUR" } } });
check("a refused update never touches the invoice", !seen.some((r) => /\/invoice/.test(r.url)));

// ------------------------------------------------------------------- idempotency
section("idempotent creation (P4.2)");
const DRAFT = { customer_id: "1", lines: [{ item_id: "7", quantity: 2, unit_price: 150 }] };
creates.length = 0;
const created = await call(REALM_MULTI, "create_invoice", DRAFT);
check("one create reached the provider", creates.length === 1, String(creates.length));
check("requestid rides as QuickBooks' idempotency parameter", /requestid=/.test(creates[0].url));
check("the entity is well formed", creates[0].entity.Line[0].DetailType === "SalesItemLineDetail" && creates[0].entity.Line[0].Amount === 300);
check("absent fields are omitted, not nulled", !("DocNumber" in creates[0].entity));
creates.length = 0;
const replay = await call(REALM_MULTI, "create_invoice", DRAFT);
check("the same intent creates nothing further", creates.length === 0);
check("and replays the original invoice", JSON.parse(replay.content[1].text).id === JSON.parse(created.content[1].text).id);
check("the replay is stated plainly", /already created/.test(replay.content[0].text));
creates.length = 0;
await call(REALM_MULTI, "create_invoice", { lines: [{ unit_price: 150, item_id: "7", quantity: 2 }], customer_id: "1" });
check("argument order does not change the intent", creates.length === 0);
holdMs = 50;
creates.length = 0;
const concurrent = await Promise.all(Array.from({ length: 5 }, () => call(REALM_MULTI, "create_invoice", { customer_id: "2", lines: [{ item_id: "7", amount: 300 }] })));
check("five simultaneous submissions create one invoice", creates.length === 1, String(creates.length));
check("all five callers get the same invoice", new Set(concurrent.map((r) => JSON.parse(r.content[1].text).id)).size === 1);
holdMs = 0;
creates.length = 0;
await call(REALM_MULTI, "create_invoice", { customer_id: "1", lines: [{ item_id: "7", quantity: 3, unit_price: 150 }] });
check("a different invoice is never collapsed", creates.length === 1);
creates.length = 0;
await call(REALM_MULTI, "create_invoice", DRAFT, ACTOR_B);
check("another user's identical intent is its own invoice", creates.length === 1);

// ------------------------------------------------------------ update, void, send
section("update, void and send (P4.3)");
seen.length = 0;
const updated = await call(REALM_MULTI, "update_invoice", { invoice_id: "101", patch: { DueDate: "2026-09-01" } });
const updateBody = seen.filter((r) => r.method === "POST").pop();
// Anchored so an error message containing "cannot be updated" cannot pass this.
check("the update succeeded", /^Invoice .* updated\./.test(updated.content[0].text), updated.content[0].text);
check("a fresh SyncToken is read immediately before writing", seen.some((r) => r.method === "GET" && /\/invoice\/101\?/.test(r.url)), JSON.stringify(seen.map((r) => `${r.method} ${r.url.slice(0, 60)}`)));
check("a write actually reached the provider", updateBody !== undefined);
check(
  "only the supplied field, the id and the token are sent",
  lastPostBody !== null && Object.keys(lastPostBody).sort().join(",") === "DueDate,Id,SyncToken,sparse",
  JSON.stringify(lastPostBody),
);
check("sparse is declared to QuickBooks", lastPostBody?.sparse === true);
check("totals are never written back", !("TotalAmt" in (lastPostBody ?? {})) && !("Balance" in (lastPostBody ?? {})));
// Through the schema, as the MCP SDK does before any handler runs.
const updateSchema = tool("update_invoice").schema;
check("a caller cannot write a derived total", updateSchema.safeParse({ invoice_id: "101", patch: { TotalAmt: 999 } }).success === false);
check("nor a balance, nor a SyncToken, nor sparse itself", ["Balance", "SyncToken", "sparse", "MetaData", "Id"].every((f) => updateSchema.safeParse({ invoice_id: "101", patch: { [f]: 1 } }).success === false));
check("an empty patch is refused", updateSchema.safeParse({ invoice_id: "101", patch: {} }).success === false);
check("a real field is accepted", updateSchema.safeParse({ invoice_id: "101", patch: { DueDate: "2026-09-01" } }).success === true);

staleTokenTimes = 1;
seen.length = 0;
const retried = await call(REALM_MULTI, "update_invoice", { invoice_id: "101", patch: { DueDate: "2026-10-01" } });
check("a stale SyncToken is retried once and succeeds", /updated/i.test(retried.content[0].text), retried.content[0].text.slice(0, 120));
check("the retry re-read the token rather than reusing it", seen.filter((r) => r.method === "GET" && /\/invoice\/101\?/.test(r.url)).length === 2, String(seen.filter((r) => r.method === "GET").length));
staleTokenTimes = 2;
const conflicted = await call(REALM_MULTI, "update_invoice", { invoice_id: "101", patch: { DueDate: "2026-11-01" } });
check("persistent contention fails with an actionable conflict", /being changed by someone else/.test(conflicted.content[0].text), conflicted.content[0].text.slice(0, 140));
check("and says nothing was written", /Nothing was written/.test(conflicted.content[0].text));
staleTokenTimes = 0;

seen.length = 0;
const voided = await call(REALM_MULTI, "void_invoice", { invoice_id: "101" });
check("void reports success", /voided/i.test(voided.content[0].text), voided.content[0].text.slice(0, 120));
check("void goes through the void operation, not a delete", seen.some((r) => /operation=void/i.test(r.url)), JSON.stringify(seen.map((r) => r.url)));
check("no request ever asks QuickBooks to delete", !seen.some((r) => /operation=delete/i.test(r.url)));

// The stand-in invoice totals 10, which is what an approver would have been shown.
seen.length = 0;
const sent = await call(REALM_MULTI, "send_invoice", { invoice_id: "101", send_to: "billing@example.com", expected_total: 10 });
check("send reports the resolved recipient", /billing@example\.com/.test(sent.content[0].text), sent.content[0].text.slice(0, 140));
check("send hits the provider's send endpoint", seen.some((r) => /\/send/.test(r.url) && /sendTo=billing/i.test(r.url)), JSON.stringify(seen.map((r) => r.url)));
check("the invoice is re-read before the email goes out", seen.some((r) => r.method === "GET" && /\/invoice\/101\?/.test(r.url)));

seen.length = 0;
const staleAmount = await call(REALM_MULTI, "send_invoice", { invoice_id: "101", send_to: "billing@example.com", expected_total: 999 });
check("an invoice whose total moved is not emailed", /not the 999 this send was approved for/.test(staleAmount.content[0].text), staleAmount.content[0].text.slice(0, 180));
check("and nothing was sent", !seen.some((r) => /\/send/.test(r.url)), JSON.stringify(seen.map((r) => r.url)));
check("the approved amount is required, not optional", tool("send_invoice").schema.safeParse({ invoice_id: "101", send_to: "a@b.com" }).success === false);
check("a rounding difference is tolerated", (await call(REALM_MULTI, "send_invoice", { invoice_id: "101", send_to: "billing@example.com", expected_total: 10.001 })).content[0].text.includes("emailed"));
// Asserted against the schema rather than by calling the handler: over HTTP the MCP
// SDK validates arguments before a handler ever runs, and calling it directly here
// would bypass exactly the check being verified.
check("an unusable recipient never reaches the provider", tool("send_invoice").schema.safeParse({ invoice_id: "101", send_to: "not-an-email" }).success === false);
check("a well-formed request is accepted by the schema", tool("send_invoice").schema.safeParse({ invoice_id: "101", send_to: "billing@example.com", expected_total: 10 }).success === true);
check("send requires a recipient at all", tool("send_invoice").schema.safeParse({ invoice_id: "101" }).success === false);

// -------------------------------------------------------------------- PDF as link
section("invoice PDF as a link (P4.1)");
const pdfResult = await call(REALM_MULTI, "get_invoice_pdf", { invoice_id: "101" });
const pdfPayload = JSON.parse(pdfResult.content[1].text);
check("no base64 anywhere in the answer", !/[A-Za-z0-9+/]{200,}={0,2}/.test(JSON.stringify(pdfResult)));
check("an absolute link is returned", /^https:\/\/qbo\.example\.com\/v1\/pdf\//.test(pdfPayload.download_url), pdfPayload.download_url);
check("it declares itself single use", pdfPayload.single_use === true);
const handle = pdfPayload.download_path.split("/").pop();
check("the handle is 256 bits", Buffer.from(handle, "base64url").length === 32);
check("another company cannot redeem it", takePdfForDownload(REALM_AST, handle) === undefined);
check("a wrong-company attempt does not destroy it", pdfHandleStats().handles === 1);
check("the owner redeems the exact bytes", takePdfForDownload(REALM_MULTI, handle)?.bytes.equals(PDF_BYTES) === true);
check("redemption is single use", takePdfForDownload(REALM_MULTI, handle) === undefined);
check("redemption releases the memory", pdfHandleStats().totalBytes === 0);
const nonPdf = await call(REALM_MULTI, "get_invoice_pdf", { invoice_id: "999" });
check("a non-document reply is refused", /did not return a PDF|Error preparing/i.test(JSON.stringify(nonPdf)));
check("and nothing is retained", pdfHandleStats().handles === 0);

// ------------------------------------------------------- transport policy (P6.3)
section("concurrency, throttling and the breaker (P6.3)");
const sem = new Semaphore(2, 1);
const r1 = await sem.acquire();
const r2 = await sem.acquire();
check("the permit count is respected", sem.stats().active === 2);
let rejected = false;
const queued = sem.acquire();
await sem.acquire().catch((e) => { rejected = e instanceof ConcurrencyLimitError; });
check("the wait queue is bounded, not infinite", rejected);
r1(); r1();
check("a double release cannot inflate the permits", sem.stats().active <= 2, JSON.stringify(sem.stats()));
(await queued)(); r2();

resetTransportPolicyState();
configureTransportPolicy({ ...DEFAULT_TRANSPORT_LIMITS, maxConcurrent: 3 });
holdMs = 40;
peakInFlight = 0;
forgetRealm(REALM_MULTI);
await Promise.all(Array.from({ length: 12 }, (_, i) => call(REALM_MULTI, "search_invoices", { limit: 5, offset: i + 1 }, ACTOR_A, `conc-${i}`)));
check("concurrency never exceeds the cap", peakInFlight <= 3, `peak ${peakInFlight}`);
holdMs = 0;

resetTransportPolicyState();
throttleOnce = true;
seen.length = 0;
const throttled = await call(REALM_MULTI, "search_invoices", { limit: 5, offset: 7 }, ACTOR_A, "throttle-1");
check("a 429 is retried, not surfaced as a failure", !/Error searching/.test(throttled.content[0].text), throttled.content[0].text.slice(0, 100));
check("the retry actually happened", transportStats().retried === 1, JSON.stringify(transportStats()));
check("throttling is counted", transportStats().throttled === 1);

resetTransportPolicyState();
configureTransportPolicy({ ...DEFAULT_TRANSPORT_LIMITS, breakerFailureThreshold: 3, breakerCooldownMs: 30_000 });
failWith = 500;
failCount = 10;
for (let i = 0; i < 5; i += 1) {
  forgetRealm(REALM_MULTI);
  await call(REALM_MULTI, "search_invoices", { limit: 5, offset: 100 + i }, ACTOR_A, `break-${i}`);
}
check("repeated provider failures open the breaker", transportStats().breakerOpen === true, JSON.stringify(transportStats()));
const shed = await call(REALM_MULTI, "search_invoices", { limit: 5, offset: 200 }, ACTOR_A, "shed-1");
check("an open breaker sheds load with an explanation", /failing repeatedly/.test(JSON.stringify(shed)), JSON.stringify(shed).slice(0, 160));
failWith = null;
configureTransportPolicy({ ...DEFAULT_TRANSPORT_LIMITS, breakerCooldownMs: 1 });
await new Promise((r) => setTimeout(r, 5));
forgetRealm(REALM_MULTI);
const recovered = await call(REALM_MULTI, "search_invoices", { limit: 5, offset: 300 }, ACTOR_A, "recover-1");
check("the breaker closes again once the provider recovers", !/failing repeatedly/.test(JSON.stringify(recovered)));

resetTransportPolicyState();
configureTransportPolicy({ ...DEFAULT_TRANSPORT_LIMITS, maxReadsPerRequest: 3 });
let budgetHit = false;
await runInTenantScope(tenantFor(REALM_MULTI, ACTOR_A, "budget-1"), async () => {
  for (let i = 0; i < 6 && !budgetHit; i += 1) {
    forgetRealm(REALM_MULTI);
    const out = await tool("search_invoices").handler({ params: { limit: 5, offset: 400 + i } });
    if (/per-request ceiling/.test(JSON.stringify(out))) budgetHit = true;
  }
});
check("one tool call cannot burn unbounded metered reads", budgetHit);
check("the ceiling is a typed error", typeof ReadBudgetError === "function");
configureTransportPolicy(DEFAULT_TRANSPORT_LIMITS);
resetTransportPolicyState();
check("reads and writes are counted separately", (() => { const s = transportStats(); return s.reads === 0 && s.writes === 0; })());

// -------------------------------------------------------------- tenant binding
section("realm/token binding (P3.2)");
const KEY = "regression-signing-key-0123456789abcdef";
const TOKEN_A = "intuit-token-a-000000000000000000000000";
const TOKEN_B = "intuit-token-b-111111111111111111111111";
const sign = (over = {}) => signTenantBinding({ realmId: REALM_MULTI, actorUserId: ACTOR_A, chatbotId: CHATBOT, connectorId: CONNECTOR, accessToken: TOKEN_A, issuedAt: Math.floor(Date.now() / 1000), ...over }, over.key ?? KEY);
const verified = verifyTenantBinding({ binding: sign(), realmId: REALM_MULTI, accessToken: TOKEN_A, key: KEY });
check("a genuine binding verifies and names the actor", verified.actorUserId === ACTOR_A);
check("the token never appears inside the binding", !sign().includes(TOKEN_A));
const rejection = (input) => { try { verifyTenantBinding(input); return null; } catch (e) { return e.code; } };
check("a missing binding is refused", rejection({ binding: undefined, realmId: REALM_MULTI, accessToken: TOKEN_A, key: KEY }) === BINDING_ERROR_CODES.MISSING);
check("a foreign signature is refused", rejection({ binding: sign({ key: "another-signing-key-0123456789abcdef" }), realmId: REALM_MULTI, accessToken: TOKEN_A, key: KEY }) === BINDING_ERROR_CODES.SIGNATURE);
check("a stale binding is refused", rejection({ binding: sign({ issuedAt: Math.floor(Date.now() / 1000) - 600 }), realmId: REALM_MULTI, accessToken: TOKEN_A, key: KEY }) === BINDING_ERROR_CODES.EXPIRED);
const realmMismatch = rejection({ binding: sign(), realmId: REALM_AST, accessToken: TOKEN_A, key: KEY });
const tokenMismatch = rejection({ binding: sign(), realmId: REALM_MULTI, accessToken: TOKEN_B, key: KEY });
check("a guessed realm is refused", realmMismatch === BINDING_ERROR_CODES.REALM_MISMATCH);
check("a swapped token is refused", tokenMismatch === BINDING_ERROR_CODES.TOKEN_MISMATCH);
check("the two are distinguishable", realmMismatch !== tokenMismatch);

section("managed execution assertion (P7.1)");
const ASSERTION_KEY = "regression-execution-assertion-key-0123456789abcdef";
const assertion = (over = {}) => {
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    version: "v2",
    tenantId: "665f1a2b3c4d5e6f70819300",
    connectionId: "665f1a2b3c4d5e6f70819301",
    chatbotId: CHATBOT,
    connectorId: CONNECTOR,
    actorId: ACTOR_A,
    conversationId: "665f1a2b3c4d5e6f70819302",
    invocationId: "assertion-invocation-1",
    jti: "assertion-invocation-1",
    environment: "SANDBOX",
    realmId: REALM_MULTI,
    tokenFingerprint: createHash("sha256").update(TOKEN_A).digest("hex"),
    audience: "INTERNAL",
    configVersion: "7",
    issuedAt: now,
    expiresAt: now + 60,
    ...over,
  };
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const signature = createHmac("sha256", ASSERTION_KEY).update(`v2.${payload}`).digest("base64url");
  return `v2.${payload}.${signature}`;
};
const verifiedAssertion = verifyExecutionAssertion({ assertion: assertion(), realmId: REALM_MULTI, accessToken: TOKEN_A, environment: "sandbox", key: ASSERTION_KEY });
check("a managed assertion verifies its full request context", verifiedAssertion.connectionId === "665f1a2b3c4d5e6f70819301" && verifiedAssertion.audience === "INTERNAL");
check("a managed assertion never contains the bearer", !assertion().includes(TOKEN_A));
const assertionRejection = (input) => { try { verifyExecutionAssertion(input); return null; } catch (e) { return e.code; } };
check("a managed assertion rejects a swapped bearer", assertionRejection({ assertion: assertion(), realmId: REALM_MULTI, accessToken: TOKEN_B, environment: "sandbox", key: ASSERTION_KEY }) === EXECUTION_ASSERTION_ERROR_CODES.MISMATCH);
check("a managed assertion rejects a guessed realm", assertionRejection({ assertion: assertion(), realmId: REALM_AST, accessToken: TOKEN_A, environment: "sandbox", key: ASSERTION_KEY }) === EXECUTION_ASSERTION_ERROR_CODES.MISMATCH);

section("configuration fails closed");
const configError = (env) => { try { loadConfig({ QBO_MCP_SERVICE_TOKEN: "regression-service-token-0123456789ab", ...env }); return null; } catch (e) { return e.message; } };
check("no signing key is a boot failure", /QBO_MCP_BINDING_KEY must be set/.test(configError({}) ?? ""));
check("a short signing key is refused", /at least 32/.test(configError({ QBO_MCP_BINDING_KEY: "short" }) ?? ""));
check("verification is waivable only explicitly", configError({ QBO_ALLOW_UNBOUND_REQUESTS: "true" }) === null);
check("and never against production", /cannot be used against production/.test(configError({ QBO_ALLOW_UNBOUND_REQUESTS: "true", QBO_ENVIRONMENT: "production" }) ?? ""));
check("concurrency cannot be configured past the provider limit", /between 1 and 10/.test(configError({ QBO_MCP_BINDING_KEY: KEY, QBO_MAX_CONCURRENT_REQUESTS: "50" }) ?? ""));

// ------------------------------------------------------------------- HTTP surface
section("the HTTP surface");
const SERVICE_TOKEN = "regression-service-token-0123456789ab";
const httpConfig = {
  port: 0, serviceToken: SERVICE_TOKEN, environment: "sandbox", requestTimeoutMs: 20_000,
  maxRequestBytes: 1_048_576, version: "0.1.0-regression", pdf: DEFAULT_PDF_LIMITS,
  transport: DEFAULT_TRANSPORT_LIMITS, bindingKey: KEY, executionAssertionKey: ASSERTION_KEY, requireExecutionAssertion: false, allowUnboundRequests: false,
};
const httpServer = createHttpServer(httpConfig);
await new Promise((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${httpServer.address().port}`;

async function rpc({ realmId = REALM_MULTI, token = TOKEN_A, binding, assertion: executionAssertion, serviceToken = SERVICE_TOKEN, method = "tools/list", params = {} } = {}) {
  const headers = { "content-type": "application/json", accept: "application/json, text/event-stream", "x-service-token": serviceToken, authorization: `Bearer ${token}` };
  if (binding !== undefined) headers[BINDING_HEADER] = binding;
  if (executionAssertion !== undefined) headers[EXECUTION_ASSERTION_HEADER] = executionAssertion;
  const response = await fetch(`${base}/v1/mcp/${realmId}`, { method: "POST", headers, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  const raw = await response.text();
  const line = raw.split("\n").find((l) => l.startsWith("data: "));
  let body; try { body = JSON.parse(line ? line.slice(6) : raw); } catch { body = raw; }
  return { status: response.status, body };
}

const health = await fetch(`${base}/health`).then((r) => r.json());
check("health reports readiness", health.status === "ok");
check("health reports the running version", health.version === "0.1.0-regression");
check("health exposes cache counters", health.caches.reference.preferences !== undefined);
check("health exposes QuickBooks counters", health.quickbooks.permits !== undefined, JSON.stringify(health.quickbooks));

// Compared against the allowlist rather than a literal, so the surface size can
// change without weakening what this asserts: every exposed tool is published.
const listed = await rpc({ binding: sign() });
check(
  "a correctly bound request is served",
  listed.status === 200 && listed.body.result.tools.length === ALLOWLISTED_TOOLS.length,
  `${listed.status}, ${listed.body?.result?.tools?.length} of ${ALLOWLISTED_TOOLS.length} tools`,
);
const assertionListed = await rpc({ assertion: assertion(), binding: undefined });
check(
  "a correctly asserted request is served",
  assertionListed.status === 200 && assertionListed.body.result.tools.length === ALLOWLISTED_TOOLS.length,
  `${assertionListed.status}, ${assertionListed.body?.result?.tools?.length} of ${ALLOWLISTED_TOOLS.length} tools`,
);
check("an asserted request does not need the legacy binding", assertionListed.status === 200);
const assertionReplay = assertion({ jti: "assertion-replay-1", invocationId: "assertion-replay-1" });
const firstAssertedCall = await rpc({ assertion: assertionReplay, binding: undefined, method: "tools/call", params: { name: "search_invoices", arguments: { limit: 1, offset: 0 } } });
const replayedAssertedCall = await rpc({ assertion: assertionReplay, binding: undefined, method: "tools/call", params: { name: "search_invoices", arguments: { limit: 1, offset: 0 } } });
check("an asserted tool call is accepted once", firstAssertedCall.status === 200);
check("an asserted tool call replay is rejected", replayedAssertedCall.status === 409 && replayedAssertedCall.body.error === "EXECUTION_ASSERTION_REPLAYED");
// Each tool publishes its own fields as the tool's arguments. Nesting them under a single
// "params" property cost two levels of schema depth and made every call depend on the caller
// remembering a wrapper the schema does not read like, so arguments in the obvious shape were
// rejected as unknown and the tool looked broken instead of misaddressed.
const toolSchema = (name) => listed.body.result.tools.find((t) => t.name === name).inputSchema;
check("tool arguments are published flat, with no params wrapper",
  listed.body.result.tools.every((t) => !("params" in (t.inputSchema.properties ?? {}))),
  JSON.stringify(Object.keys(toolSchema("update_invoice").properties ?? {})));
check("update_invoice asks for the invoice and a patch", ["invoice_id", "patch"].every((key) => key in toolSchema("update_invoice").properties));
const schemaProps = toolSchema("search_invoices").properties;
check("the search schema is bounded", schemaProps.limit.maximum === 100 && schemaProps.filters.maxItems === 8);
check("fetchAll cannot be expressed", !("fetchAll" in schemaProps) && !("criteria" in schemaProps));
check("filter fields are a closed enum", Array.isArray(schemaProps.filters.items.properties.field.enum));
const pdfSchema = toolSchema("get_invoice_pdf").properties;
check("the PDF tool no longer writes to disk", !("output_path" in pdfSchema) && !("overwrite" in pdfSchema));
check("get_company_info takes no company id", Object.keys(toolSchema("get_company_info").properties ?? {}).length === 0);

check("an unbound request is refused", (await rpc({})).status === 403);
check("a guessed realm is refused over HTTP", (await rpc({ realmId: REALM_AST, binding: sign() })).body.error === BINDING_ERROR_CODES.REALM_MISMATCH);
check("a swapped token is refused over HTTP", (await rpc({ token: TOKEN_B, binding: sign() })).body.error === BINDING_ERROR_CODES.TOKEN_MISMATCH);
check("an unauthenticated caller is refused despite a valid binding", (await rpc({ binding: sign(), serviceToken: "wrong-token-but-long-enough-value" })).status === 401);

const stored = storePdfForDownload({ realmId: REALM_MULTI, invoiceId: "101", bytes: PDF_BYTES });
const pdfPath = `/v1/pdf/${REALM_MULTI}/${stored.handle}`;
check("the download route needs the service token", (await fetch(`${base}${pdfPath}`)).status === 401);
check("a non-GET is refused", (await fetch(`${base}${pdfPath}`, { method: "POST", headers: { "x-service-token": SERVICE_TOKEN } })).status === 405);
check("a wrong company is 404", (await fetch(`${base}/v1/pdf/${REALM_AST}/${stored.handle}`, { headers: { "x-service-token": SERVICE_TOKEN } })).status === 404);
const download = await fetch(`${base}${pdfPath}`, { headers: { "x-service-token": SERVICE_TOKEN } });
check("the owner receives the PDF", download.status === 200 && download.headers.get("content-type") === "application/pdf");
check("served as a named attachment", download.headers.get("content-disposition") === 'attachment; filename="invoice-101.pdf"');
check("never cached by a proxy", download.headers.get("cache-control") === "no-store" && download.headers.get("x-content-type-options") === "nosniff");
check("the bytes match", Buffer.from(await download.arrayBuffer()).equals(PDF_BYTES));
check("the link works exactly once", (await fetch(`${base}${pdfPath}`, { headers: { "x-service-token": SERVICE_TOKEN } })).status === 404);

section("what a call reports back to the API (P6.1)");
const READS_KEY = "com.paloaltoinnovationlabs.qbo/metered-reads";
const RISK_KEY = "com.paloaltoinnovationlabs.qbo/risk";
const called = await rpc({
  binding: sign(),
  method: "tools/call",
  params: { name: "search_invoices", arguments: { limit: 5, offset: 900 } },
});
const callMeta = called.body.result?._meta ?? {};
check("a call reports what it cost in metered reads", callMeta[READS_KEY] === 1, JSON.stringify(callMeta));
check("a call reports its own risk classification", callMeta[RISK_KEY] === "READ_ONLY", JSON.stringify(callMeta));

// A create resolves nothing beforehand here, so it should cost reads only for the
// preference probe — and must not be reported as a read-only call.
forgetRealm(REALM_MULTI);
const writeCall = await rpc({
  binding: sign(),
  method: "tools/call",
  params: {
    name: "create_invoice",
    arguments: { customer_id: "77", lines: [{ item_id: "7", amount: 12 }] },
  },
});
const writeMeta = writeCall.body.result?._meta ?? {};
check("a write is reported as a write, not a read", writeMeta[RISK_KEY] === "WRITE", JSON.stringify(writeMeta));
check("a send is the highest tier the service has", ALLOWLISTED_TOOLS.find((t) => t.definition.name === "send_invoice").risk === "HIGH_RISK");
check("the count is per call, not cumulative for the process", typeof writeMeta[READS_KEY] === "number" && writeMeta[READS_KEY] < 5, JSON.stringify(writeMeta));

// A write's result is what a person ends up reading, so it stays the compact projection with a
// link into QuickBooks rather than the raw entity: the raw form buries the four numbers that
// matter under a hundred payment flags, and gives nobody a way to go and check.
const writePayload = JSON.parse(writeCall.body.result.content.at(-1).text);
check("a write returns the compact invoice, not the raw entity",
  !("AllowIPNPayment" in writePayload) && !("SyncToken" in writePayload) && typeof writePayload.total === "number",
  JSON.stringify(Object.keys(writePayload)));
check("a write links to the invoice in the right QuickBooks environment",
  typeof writePayload.view_url === "string"
    && writePayload.view_url.startsWith("https://sandbox.qbo.intuit.com/app/invoice?txnId=")
    && writePayload.view_url.endsWith(String(writePayload.id)),
  String(writePayload.view_url));

section("graceful shutdown (P7.1)");
// A genuine drain: the request must already be at the provider before close() is
// called, otherwise this only proves that close() refuses new connections.
holdMs = 200;
const inflight = rpc({
  binding: sign(),
  method: "tools/call",
  params: { name: "search_invoices", arguments: { limit: 5, offset: 777 } },
});
await new Promise((resolve) => setTimeout(resolve, 60));
check("the request reached the provider before shutdown", seen.some((r) => / startposition 777/.test(r.url)));
const closed = new Promise((resolve) => httpServer.close(resolve));
const drained = await inflight;
await closed;
holdMs = 0;
check("an in-flight request completes while the server closes", drained.status === 200, String(drained.status));
check("and returns its result rather than being cut off", drained.body.result !== undefined, JSON.stringify(drained.body).slice(0, 120));
check("the server is closed afterwards", await fetch(`${base}/health`).then(() => false, () => true));

provider.close();
console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length > 0) console.log(failures.map((f) => `  - ${f}`).join("\n"));
process.exit(failures.length === 0 ? 0 : 1);
