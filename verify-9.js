#!/usr/bin/env node
// Verify the 9 re-authed clients end-to-end: refresh (clients.json token),
// persist rotation to BOTH stores, pull a real P&L. Reports per-slug result.
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
const redirectUri = process.env.QUICKBOOKS_REDIRECT_URI;
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const apiBase = environment === 'production'
  ? 'https://quickbooks.api.intuit.com' : 'https://sandbox-quickbooks.api.intuit.com';

const SLUGS = [
  '11368-realty-llc','869-old-country-llc','duane-park-patisserie','feneti-window-system',
  'green-team-li','hempstead-218-realty-llc','modena-realty-llc','modena-window-design-llc',
  'ny-monda-window-door-inc',
];

const clientsPath = path.join(__dirname, 'clients.json');
const clients = JSON.parse(fs.readFileSync(clientsPath, 'utf-8'));

async function syncSupabase(slug, rt) {
  await fetch(`${supabaseUrl}/rest/v1/qbo_clients?slug=eq.${encodeURIComponent(slug)}`, {
    method: 'PATCH',
    headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ refresh_token: rt, updated_at: new Date().toISOString() }),
  });
}

const rows = [];
for (const slug of SLUGS) {
  const c = clients[slug];
  try {
    const oauth = new OAuthClient({ clientId, clientSecret, environment, redirectUri });
    const { token } = await oauth.refreshUsingToken(c.refresh_token);
    if (token.refresh_token && token.refresh_token !== c.refresh_token) {
      c.refresh_token = token.refresh_token;
      await syncSupabase(slug, token.refresh_token);
    }
    const r = await fetch(`${apiBase}/v3/company/${c.realm_id}/reports/ProfitAndLoss?minorversion=65`, {
      headers: { Authorization: `Bearer ${token.access_token}`, Accept: 'application/json' },
    });
    if (!r.ok) throw new Error(`P&L HTTP ${r.status}`);
    const data = await r.json();
    const period = `${data?.Header?.StartPeriod}..${data?.Header?.EndPeriod}`;
    const days = Math.round((token.x_refresh_token_expires_in || 0) / 86400);
    rows.push({ slug, realm: c.realm_id, ok: true, period, days });
  } catch (e) {
    rows.push({ slug, realm: c?.realm_id, ok: false, err: e.message });
  }
}

// persist clients.json rotations
const tmp = `${clientsPath}.tmp.${process.pid}`;
fs.writeFileSync(tmp, JSON.stringify(clients, null, 2) + '\n', { mode: 0o600 });
fs.renameSync(tmp, clientsPath);

const ok = rows.filter(r => r.ok).length;
console.log(`\n=== VERIFY 9 re-authed clients: ${ok}/9 P&L OK ===\n`);
for (const r of rows) {
  console.log(`  ${r.ok ? '✓' : '✗'} ${r.slug.padEnd(28)} realm=${r.realm}  ${r.ok ? `${r.days}d left  P&L ${r.period}` : 'FAIL: ' + r.err}`);
}
