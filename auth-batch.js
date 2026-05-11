#!/usr/bin/env node
import OAuthClient from 'intuit-oauth';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import open from 'open';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

const clientId = process.env.QUICKBOOKS_CLIENT_ID;
const clientSecret = process.env.QUICKBOOKS_CLIENT_SECRET;
const redirectUri = process.env.QUICKBOOKS_REDIRECT_URI || 'http://localhost:8000/callback';
const environment = process.env.QUICKBOOKS_ENVIRONMENT || 'production';
const PORT = 8000;

if (!clientId || !clientSecret) {
  console.error('QUICKBOOKS_CLIENT_ID and QUICKBOOKS_CLIENT_SECRET must be set in .env');
  process.exit(1);
}

const clientsPath = path.join(__dirname, 'clients.json');
let clients = JSON.parse(fs.readFileSync(clientsPath, 'utf-8'));
const slugs = Object.keys(clients);

const skipArg = process.argv[2];
let startIndex = 0;
if (skipArg === '--resume') {
  const resumeSlug = process.argv[3];
  const idx = slugs.indexOf(resumeSlug);
  if (idx >= 0) startIndex = idx;
  else console.error(`Slug "${resumeSlug}" not found, starting from beginning`);
} else if (skipArg === '--only-failed') {
  // Test each token first, skip ones that work
  console.log('Pre-checking tokens to find which need re-auth...\n');
}

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

function saveClients() {
  const tmpPath = `${clientsPath}.tmp.${process.pid}`;
  fs.writeFileSync(tmpPath, JSON.stringify(clients, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(tmpPath, clientsPath);
}

async function syncToSupabase(slug, client) {
  if (!supabaseUrl || !supabaseKey) return;
  const update = {
    slug,
    name: client.name,
    realm_id: client.realm_id,
    refresh_token: client.refresh_token,
    added_at: client.added || new Date().toISOString().split('T')[0],
    updated_at: new Date().toISOString(),
  };
  try {
    const resp = await fetch(`${supabaseUrl}/rest/v1/qbo_clients`, {
      method: 'POST',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(update),
    });
    if (resp.ok) console.log(`  ↳ Synced to Supabase`);
    else console.log(`  ↳ Supabase sync failed: ${resp.status}`);
  } catch {
    console.log(`  ↳ Supabase sync failed (network error)`);
  }
}

function authOneClient(slug) {
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

        clients[slug] = {
          name: clients[slug]?.name || slug,
          realm_id: tokens.realmId,
          refresh_token: tokens.refresh_token,
          added: new Date().toISOString().split('T')[0],
        };
        saveClients();

        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`<html><body style="display:flex;flex-direction:column;justify-content:center;align-items:center;height:100vh;margin:0;font-family:system-ui;background:#f0fdf4;">
          <h2 style="color:#16a34a;">&#10003; ${clients[slug].name}</h2>
          <p style="color:#666;">Realm: ${tokens.realmId}</p>
          <p style="color:#888;font-size:14px;">This window will close automatically...</p>
          <script>setTimeout(()=>window.close(),1500)</script>
        </body></html>`);

        await syncToSupabase(slug, clients[slug]);

        setTimeout(() => { server.close(); resolve('ok'); }, 800);
      } catch (error) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`<html><body style="display:flex;flex-direction:column;justify-content:center;align-items:center;height:100vh;margin:0;font-family:system-ui;background:#fef2f2;">
          <h2 style="color:#dc2626;">Failed: ${slug}</h2>
          <p style="color:#666;">${error.message || error}</p>
          <script>setTimeout(()=>window.close(),2000)</script>
        </body></html>`);
        setTimeout(() => { server.close(); resolve('fail'); }, 800);
      }
    });

    server.listen(PORT, '::', () => {
      const authUri = oauthClient.authorizeUri({
        scope: [OAuthClient.scopes.Accounting],
        state: slug,
      }).toString();

      open(authUri).catch(() => {});
    });

    server.on('error', (err) => {
      console.error(`  Port ${PORT} busy — kill other processes first`);
      resolve('fail');
    });
  });
}

console.log(`
╔══════════════════════════════════════════╗
║     QBO Batch Re-Authorization Tool     ║
╠══════════════════════════════════════════╣
║  Clients: ${String(slugs.length).padEnd(30)}║
║  Starting at: ${String(startIndex + 1).padEnd(27)}║
║  Redirect: ${redirectUri.padEnd(28).slice(0, 28)} ║
╚══════════════════════════════════════════╝

For each client:
  1. Browser opens to Intuit sign-in
  2. Sign in & authorize the app
  3. Window auto-closes, moves to next

Press Ctrl+C at any time to stop.
Resume later with: node auth-batch.js --resume <slug>
`);

let okCount = 0;
let failCount = 0;
let skipCount = 0;

for (let i = startIndex; i < slugs.length; i++) {
  const slug = slugs[i];
  const num = `[${i + 1}/${slugs.length}]`;

  console.log(`\n${num} ${slug}`);

  const result = await authOneClient(slug);

  if (result === 'ok') {
    okCount++;
    console.log(`  ✓ Done`);
  } else {
    failCount++;
    console.log(`  ✗ Failed`);
  }

  if (i < slugs.length - 1) {
    await new Promise(r => setTimeout(r, 1000));
  }
}

console.log(`
════════════════════════════════════
  Done! ✓ ${okCount} ok  |  ✗ ${failCount} failed  |  ⊘ ${skipCount} skipped
  Tokens saved to clients.json${supabaseUrl ? ' + Supabase' : ''}
════════════════════════════════════
`);
