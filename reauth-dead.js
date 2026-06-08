#!/usr/bin/env node
// Re-authorize the 9 QBO clients whose refresh tokens are dead (400 on refresh).
// Hardened vs. the old reauth scripts:
//   - verifies the realmId Intuit returns matches the EXPECTED realm for the slug
//     (refuses to save on mismatch — prevents mapping a slug to the wrong company)
//   - persists to BOTH clients.json and Supabase qbo_clients
//   - prints "URL:<authorizeUri>" to stdout for Chrome automation to pick up
import OAuthClient from 'intuit-oauth';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

const clientId = process.env.QUICKBOOKS_CLIENT_ID;
const clientSecret = process.env.QUICKBOOKS_CLIENT_SECRET;
const redirectUri = process.env.QUICKBOOKS_REDIRECT_URI;
const environment = process.env.QUICKBOOKS_ENVIRONMENT || 'production';
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const PORT = 8000;

// slug -> expected realm_id (from the diagnostic). Save is rejected on mismatch.
const DEAD = {
  '11368-realty-llc':         '9341455241552816',
  '869-old-country-llc':      '9341455241551106',
  'duane-park-patisserie':    '9130357046778516',
  'feneti-window-system':     '9130357662172796',
  'green-team-li':            '193514781811699',
  'hempstead-218-realty-llc': '9341455241537608',
  'modena-realty-llc':        '9341455256989667',
  'modena-window-design-llc': '9341455241387234',
  'ny-monda-window-door-inc': '9341455256961174',
};

const clientsPath = path.join(__dirname, 'clients.json');
let clients = JSON.parse(fs.readFileSync(clientsPath, 'utf-8'));

function saveClients() {
  const tmp = `${clientsPath}.tmp.${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(clients, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(tmp, clientsPath);
}

async function syncToSupabase(slug, client) {
  if (!supabaseUrl || !supabaseKey) return;
  const update = {
    slug, name: client.name, realm_id: client.realm_id,
    refresh_token: client.refresh_token,
    added_at: client.added || new Date().toISOString().split('T')[0],
    updated_at: new Date().toISOString(),
  };
  try {
    const resp = await fetch(`${supabaseUrl}/rest/v1/qbo_clients`, {
      method: 'POST',
      headers: {
        apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(update),
    });
    console.error(resp.ok ? '  ↳ Synced to Supabase' : `  ↳ Supabase sync failed: ${resp.status}`);
  } catch { console.error('  ↳ Supabase sync failed (network error)'); }
}

function authOneClient(slug, expectedRealm) {
  return new Promise((resolve) => {
    const oauthClient = new OAuthClient({ clientId, clientSecret, environment, redirectUri });
    const server = http.createServer(async (req, res) => {
      if (!req.url?.startsWith('/callback')) {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('Waiting for QBO callback...');
        return;
      }
      try {
        const response = await oauthClient.createToken(req.url);
        const tokens = response.token;

        // GUARD: returned realm must match the expected company for this slug.
        if (String(tokens.realmId) !== String(expectedRealm)) {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(`<html><body style="font-family:system-ui;background:#fffbeb;padding:40px;">
            <h2 style="color:#b45309;">⚠ Wrong company selected for ${slug}</h2>
            <p>Expected realm <b>${expectedRealm}</b> but you selected <b>${tokens.realmId}</b>.</p>
            <p>Nothing was saved. Re-run and pick the correct company.</p></body></html>`);
          console.error(`  ✗ REALM MISMATCH: expected ${expectedRealm}, got ${tokens.realmId} — NOT saved`);
          setTimeout(() => { server.close(); resolve('mismatch'); }, 800);
          return;
        }

        clients[slug] = {
          name: clients[slug]?.name || slug,
          realm_id: tokens.realmId,
          refresh_token: tokens.refresh_token,
          added: clients[slug]?.added || new Date().toISOString().split('T')[0],
        };
        saveClients();
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`<html><body style="display:flex;flex-direction:column;justify-content:center;align-items:center;height:100vh;margin:0;font-family:system-ui;background:#f0fdf4;">
          <h2 style="color:#16a34a;">&#10003; ${clients[slug].name}</h2>
          <p style="color:#666;">Realm: ${tokens.realmId}</p></body></html>`);
        await syncToSupabase(slug, clients[slug]);
        console.error('  ✓ Done (saved + synced)');
        setTimeout(() => { server.close(); resolve('ok'); }, 800);
      } catch (error) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`<html><body style="font-family:system-ui;background:#fef2f2;padding:40px;">
          <h2 style="color:#dc2626;">Failed: ${slug}</h2><p>${error.message || error}</p></body></html>`);
        console.error(`  ✗ Failed: ${error.message || error}`);
        setTimeout(() => { server.close(); resolve('fail'); }, 800);
      }
    });
    server.listen(PORT, () => {
      const authUri = oauthClient.authorizeUri({ scope: [OAuthClient.scopes.Accounting], state: slug }).toString();
      console.log(`URL:${authUri}`);            // stdout — for Chrome automation
      console.error(`  Waiting for OAuth callback (expected realm ${expectedRealm})...`);
    });
    server.on('error', (err) => {
      console.error(`  Port ${PORT} busy — ${err.message}`);
      resolve('fail');
    });
  });
}

const slugs = process.argv.slice(2).filter(s => DEAD[s]);
const targets = slugs.length ? slugs : Object.keys(DEAD);

console.error(`\nRe-authorizing ${targets.length} dead QBO client(s)`);
console.error(`Redirect URI: ${redirectUri}\n`);

let ok = 0, bad = 0;
for (let i = 0; i < targets.length; i++) {
  const slug = targets[i];
  console.error(`[${i + 1}/${targets.length}] ${slug}`);
  const r = await authOneClient(slug, DEAD[slug]);
  if (r === 'ok') ok++; else bad++;
  if (i < targets.length - 1) await new Promise(r => setTimeout(r, 1000));
}
console.error(`\n✓ ${ok} ok  |  ✗ ${bad} not completed\n`);
