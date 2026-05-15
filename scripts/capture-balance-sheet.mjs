// Capture two Balance Sheet responses that differ ONLY in whether start_date
// is passed. Designed to settle the PR #41 review question: does QBO silently
// drop end_date when start_date is absent?
//
// Usage:
//   node scripts/capture-balance-sheet.mjs <END_DATE>
//   (END_DATE defaults to 2025-06-30)
//
// Pipes both responses to stdout. Redact business name / PII before posting.

import { getQuickbooksBalanceSheet } from "../dist/handlers/get-quickbooks-balance-sheet.handler.js";

const end_date = process.argv[2] || "2025-06-30";

function redact(obj) {
  const s = JSON.stringify(obj, null, 2);
  // Redact CompanyName, common PII fields if present
  return s
    .replace(/"CompanyName":\s*"[^"]*"/g, '"CompanyName": "<REDACTED>"')
    .replace(/"ReportName":\s*"[^"]*"/g, '"ReportName": "BalanceSheet"');
}

async function run(label, opts) {
  console.log(`\n=== ${label} ===`);
  console.log("Request opts:", JSON.stringify(opts));
  const t0 = Date.now();
  const res = await getQuickbooksBalanceSheet(opts);
  console.log(`Elapsed: ${Date.now() - t0}ms`);
  if (res.isError) {
    console.log("ERROR:", res.error);
    return;
  }
  // Print only the Header (date params QBO echoes back) and a few key totals.
  const header = res.result?.Header;
  console.log("Header:", redact(header));
  // Walk rows to find Total Assets / Total Liabilities And Equity summary rows
  const summary = [];
  function walk(rows) {
    if (!rows) return;
    const arr = Array.isArray(rows) ? rows : rows.Row;
    if (!arr) return;
    for (const r of (Array.isArray(arr) ? arr : [arr])) {
      if (r?.Summary?.ColData) {
        const cells = r.Summary.ColData.map(c => c.value).join(" | ");
        summary.push(cells);
      }
      if (r?.Rows) walk(r.Rows);
    }
  }
  walk(res.result?.Rows);
  console.log("Summary rows (last 10):");
  console.log(summary.slice(-10).join("\n"));
}

await run("WITH start_date (2025-01-01)", { end_date, start_date: "2025-01-01" });
await run("WITHOUT start_date", { end_date });

process.exit(0);
