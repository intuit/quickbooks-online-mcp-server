#!/usr/bin/env node
// One-off diagnostic: end-to-end P&L request across all QBO clients.
// For each client: refresh (Supabase token, fallback clients.json token),
// persist any rotated token to BOTH Supabase and clients.json, then pull a
// real ProfitAndLoss report. Classifies: ok | pnl_error | expired(auth dead).
import OAuthClient from 'intuit-oauth';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

const clientId = process.env.QUICKBOOKS_CLIENT_ID;
const clientSecret = process.env.QUICKBOOKS_CLIENT_SECRET;
const environment = process.env.QUICKBOOKS_ENVIRONMENT || 'production';
const redirectUri = process.env.QUICKBOOKS_REDIRECT_URI || 'http://localhost:8000/callback';
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const apiBase = environment === 'production'
  ? 'https://quickbooks.api.intuit.com'
  : 'https://sandbox-quickbooks.api.intuit.com';

const clientsPath = path.join(__dirname, 'clients.json');
const localClients = JSON.parse(fs.readFileSync(clientsPath, 'utf-8'));

function newOAuth() {
  return new OAuthClient({ clientId, clientSecret, environment, redirectUri });
}

async function supabasePatchToken(slug, refreshToken) {
  const resp = await fetch(`${supabaseUrl}/rest/v1/qbo_clients?slug=eq.${encodeURIComponent(slug)}`, {
    method: 'PATCH',
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ refresh_token: refreshToken, updated_at: new Date().toISOString() }),
  });
  return resp.ok;
}

// Try refreshing a refresh_token. Returns {token} on success or throws.
async function tryRefresh(rt) {
  const oauth = newOAuth();
  const response = await oauth.refreshUsingToken(rt);
  return response.token;
}

async function pullPnl(realmId, accessToken) {
  const url = `${apiBase}/v3/company/${realmId}/reports/ProfitAndLoss?minorversion=65`;
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
  });
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`HTTP ${resp.status}: ${body.slice(0, 160)}`);
  }
  const data = await resp.json();
  // Extract NetIncome from the report summary if present.
  let netIncome = null;
  const findRow = (rows) => {
    if (!Array.isArray(rows)) return;
    for (const r of rows) {
      if (r.group === 'NetIncome' && r.Summary?.ColData) netIncome = r.Summary.ColData.at(-1)?.value;
      if (r.Rows?.Row) findRow(r.Rows.Row);
    }
  };
  findRow(data?.Rows?.Row);
  const period = `${data?.Header?.StartPeriod || '?'}..${data?.Header?.EndPeriod || '?'}`;
  return { netIncome, period };
}

// Load authoritative Supabase rows.
const sbResp = await fetch(`${supabaseUrl}/rest/v1/qbo_clients?select=slug,realm_id,refresh_token&order=slug`, {
  headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` },
});
const sbRows = await sbResp.json();

const results = [];
const clientsJsonUpdates = {}; // slug -> new refresh_token to write at end

for (let i = 0; i < sbRows.length; i++) {
  const { slug, realm_id, refresh_token: sbToken } = sbRows[i];
  const localToken = localClients[slug]?.refresh_token;
  process.stderr.write(`[${i + 1}/${sbRows.length}] ${slug} ... `);

  let token = null;
  let source = null;
  let authErr = null;

  // 1) Try Supabase token.
  try {
    token = await tryRefresh(sbToken);
    source = 'supabase';
  } catch (e) {
    authErr = e?.message || String(e);
    // 2) Fallback: clients.json token (if different).
    if (localToken && localToken !== sbToken) {
      try {
        token = await tryRefresh(localToken);
        source = 'clients.json';
        authErr = null;
      } catch (e2) {
        authErr = `sb:[${authErr}] local:[${e2?.message || e2}]`;
      }
    }
  }

  if (!token) {
    results.push({ slug, realm_id, status: 'EXPIRED', detail: authErr });
    process.stderr.write(`AUTH DEAD\n`);
    continue;
  }

  // Persist rotated token to BOTH stores.
  const newRT = token.refresh_token;
  const daysLeft = typeof token.x_refresh_token_expires_in === 'number'
    ? Math.round(token.x_refresh_token_expires_in / 86400) : null;
  await supabasePatchToken(slug, newRT);
  clientsJsonUpdates[slug] = newRT;

  // Now the real end-to-end test: pull P&L.
  try {
    const { netIncome, period } = await pullPnl(realm_id, token.access_token);
    results.push({ slug, realm_id, status: 'ok', source, daysLeft, netIncome, period });
    process.stderr.write(`OK (refreshed via ${source}, ${daysLeft}d left)\n`);
  } catch (e) {
    results.push({ slug, realm_id, status: 'PNL_ERROR', source, daysLeft, detail: e?.message || String(e) });
    process.stderr.write(`auth ok but P&L FAILED\n`);
  }
}

// Atomically write clients.json with rotated tokens for everything that refreshed.
for (const [slug, rt] of Object.entries(clientsJsonUpdates)) {
  if (localClients[slug]) localClients[slug].refresh_token = rt;
}
const tmp = `${clientsPath}.tmp.${process.pid}`;
fs.writeFileSync(tmp, JSON.stringify(localClients, null, 2) + '\n', { mode: 0o600 });
fs.renameSync(tmp, clientsPath);

// ---- Report ----
const ok = results.filter(r => r.status === 'ok');
const pnlErr = results.filter(r => r.status === 'PNL_ERROR');
const expired = results.filter(r => r.status === 'EXPIRED');

console.log('\n================ RESULTS ================');
console.log(`Total: ${results.length}  |  OK: ${ok.length}  |  P&L error (auth ok): ${pnlErr.length}  |  EXPIRED (auth dead): ${expired.length}`);
console.log(`clients.json re-synced for ${Object.keys(clientsJsonUpdates).length} clients.\n`);

if (expired.length) {
  console.log('--- EXPIRED — need full Intuit re-auth (browser) ---');
  for (const r of expired) console.log(`  ${r.slug.padEnd(38)} realm=${r.realm_id}  ${(r.detail || '').slice(0, 90)}`);
  console.log('');
}
if (pnlErr.length) {
  console.log('--- AUTH OK but P&L request failed (likely data/API, not auth) ---');
  for (const r of pnlErr) console.log(`  ${r.slug.padEnd(38)} ${(r.detail || '').slice(0, 110)}`);
  console.log('');
}
console.log(`--- OK (${ok.length}) ---`);
for (const r of ok) console.log(`  ${r.slug.padEnd(38)} netIncome=${String(r.netIncome).padStart(14)}  ${r.daysLeft}d left  (${r.period})`);

// machine-readable tail for follow-up
console.log('\nEXPIRED_SLUGS=' + JSON.stringify(expired.map(r => r.slug)));
