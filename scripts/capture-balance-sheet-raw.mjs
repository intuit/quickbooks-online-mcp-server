// Raw capture: bypass the handler and call reportBalanceSheet directly
// so we control exactly which params reach QBO.
import { QuickbooksClient } from "../dist/clients/quickbooks-client.js";

const qb = await QuickbooksClient.getInstance();

function callBS(params) {
  return new Promise((resolve, reject) => {
    qb.reportBalanceSheet(params, (err, report) => err ? reject(err) : resolve(report));
  });
}

async function show(label, params) {
  console.log(`\n=== ${label} ===`);
  console.log("Request params:", JSON.stringify(params));
  const t0 = Date.now();
  try {
    const r = await callBS(params);
    console.log(`Elapsed: ${Date.now() - t0}ms`);
    console.log("Header.StartPeriod:", r?.Header?.StartPeriod);
    console.log("Header.EndPeriod:  ", r?.Header?.EndPeriod);
    // Last few summary rows for totals comparison
    const summaries = [];
    (function walk(rows) {
      const arr = Array.isArray(rows) ? rows : rows?.Row;
      if (!arr) return;
      for (const row of (Array.isArray(arr) ? arr : [arr])) {
        if (row?.Summary?.ColData) summaries.push(row.Summary.ColData.map(c => c.value).join(" | "));
        if (row?.Rows) walk(row.Rows);
      }
    })(r?.Rows);
    console.log("Key summary rows:");
    summaries.filter(s => /Total (Assets|Liabilities|Equity|Liabilities And Equity)/.test(s)).forEach(s => console.log("  " + s));
  } catch (e) {
    console.log("ERROR:", e?.message || e, e?.Fault || "");
  }
}

const END = process.argv[2] || "2024-12-31";

await show(`end_date=${END} only (no start_date)`, { end_date: END });
await show(`end_date=${END} + start_date=2024-01-01`, { end_date: END, start_date: "2024-01-01" });
await show(`end_date=${END} only, params object literal`, { end_date: END });

process.exit(0);
