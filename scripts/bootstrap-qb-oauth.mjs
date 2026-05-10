#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import http from 'http';
import https from 'https';
import os from 'os';
import { URLSearchParams } from 'url';
import open from 'open';
import dotenv from 'dotenv';

// ── env resolution ────────────────────────────────────────────────────────────
const home = os.homedir() || process.env.HOME || '';
const candidates = [
  process.env.QUICKBOOKS_ENV_FILE,
  home ? path.join(home, 'mcp-servers/quickbooks/.env') : undefined,
  home ? path.join(home, '.quickbooks/.env') : undefined,
  path.join(process.cwd(), '.env'),
].filter(Boolean);
const envFile = candidates.find((p) => fs.existsSync(p));
if (envFile) dotenv.config({ path: envFile });
else dotenv.config();

const clientId     = process.env.QUICKBOOKS_CLIENT_ID;
const clientSecret = process.env.QUICKBOOKS_CLIENT_SECRET;
const environment  = process.env.QUICKBOOKS_ENVIRONMENT || 'sandbox';

// registeredUri = what Intuit has in the developer portal (used in exchange)
// localPort     = where this script listens (site may proxy/redirect there)
const registeredUri = process.env.QUICKBOOKS_REDIRECTURI || 'http://localhost:8000/callback';
const parsedUri     = new URL(registeredUri);
const parsedHostname = parsedUri.hostname.toLowerCase().replace(/^\[|\]$/g, '');
const isLocalRedirect = ['localhost', '127.0.0.1', '::1'].includes(parsedHostname);
const localPort     = Number(
  process.env.QUICKBOOKS_LOCAL_PORT ||
  (isLocalRedirect ? parsedUri.port || 80 : 8081)
);

if (!clientId || !clientSecret) {
  console.error('❌  Missing QUICKBOOKS_CLIENT_ID or QUICKBOOKS_CLIENT_SECRET in', envFile);
  process.exit(1);
}

// ── env writer ────────────────────────────────────────────────────────────────
function updateEnv(updates) {
  const target = envFile || candidates[0] || path.join(process.cwd(), '.env');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const current = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : '';
  const map = new Map(
    current.split('\n').filter(Boolean).map((l) => {
      const i = l.indexOf('=');
      return i === -1 ? [l, ''] : [l.slice(0, i), l.slice(i + 1)];
    })
  );
  for (const [k, v] of Object.entries(updates)) map.set(k, String(v));
  fs.writeFileSync(target, Array.from(map.entries()).map(([k, v]) => `${k}=${v}`).join('\n') + '\n');
  console.log('✅  Tokens written to', target);
}

// ── token exchange (raw HTTPS — avoids redirect_uri mismatch in library) ─────
function exchangeCode(code, realmId) {
  return new Promise((resolve, reject) => {
    const body = new URLSearchParams({
      grant_type:   'authorization_code',
      code,
      redirect_uri: registeredUri,          // must match Intuit registration exactly
    }).toString();

    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const options = {
      hostname: 'oauth.platform.intuit.com',
      path:     '/oauth2/v1/tokens/bearer',
      method:   'POST',
      headers:  {
        Authorization:   `Basic ${auth}`,
        'Content-Type':  'application/x-www-form-urlencoded',
        Accept:          'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (d) => (data += d));
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (res.statusCode !== 200) reject(new Error(`${res.statusCode}: ${JSON.stringify(json)}`));
          else resolve({ ...json, realmId });
        } catch (e) { reject(new Error('Parse error: ' + data)); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ── success HTML ──────────────────────────────────────────────────────────────
const SUCCESS_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>QuickBooks Connected</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
      background: #f5f5f7;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
    }
    .card {
      background: #fff;
      border-radius: 18px;
      box-shadow: 0 4px 32px rgba(0,0,0,.10);
      padding: 52px 56px;
      max-width: 440px;
      width: 100%;
      text-align: center;
    }
    .icon {
      width: 72px;
      height: 72px;
      background: #e8f9ee;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 24px;
      font-size: 36px;
    }
    h1 {
      font-size: 22px;
      font-weight: 700;
      color: #1d1d1f;
      margin-bottom: 10px;
    }
    p {
      font-size: 15px;
      color: #6e6e73;
      line-height: 1.5;
      margin-bottom: 32px;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: #f5f5f7;
      border-radius: 100px;
      padding: 8px 18px;
      font-size: 13px;
      font-weight: 500;
      color: #1d1d1f;
    }
    .dot {
      width: 8px; height: 8px;
      background: #34c759;
      border-radius: 50%;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">&#x2705;</div>
    <h1>QuickBooks Connected</h1>
    <p>Your refresh token has been written to the shared env file. You can close this tab.</p>
    <div class="badge"><div class="dot"></div> Auth complete</div>
  </div>
</body>
</html>`;

// ── callback server ───────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const reqUrl = new URL(req.url, `http://localhost:${localPort}`);
  const code    = reqUrl.searchParams.get('code');
  const realmId = reqUrl.searchParams.get('realmId');

  if (!code) { res.writeHead(200); res.end('Waiting for auth callback...'); return; }

  console.log(`Got code — exchanging (redirect_uri: ${registeredUri})`);
  try {
    const token = await exchangeCode(code, realmId);
    updateEnv({
      QUICKBOOKS_REFRESH_TOKEN: token.refresh_token,
      QUICKBOOKS_REALM_ID: realmId || token.realmId || process.env.QUICKBOOKS_REALM_ID,
    });
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(SUCCESS_HTML);
    console.log('OAuth bootstrap complete.');
    setTimeout(() => server.close(() => process.exit(0)), 800);
  } catch (e) {
    console.error('Exchange failed:', e.message);
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('OAuth error: ' + e.message);
  }
});

// ── launch ────────────────────────────────────────────────────────────────────
const authUri = `https://appcenter.intuit.com/connect/oauth2` +
  `?client_id=${encodeURIComponent(clientId)}` +
  `&redirect_uri=${encodeURIComponent(registeredUri)}` +
  `&response_type=code` +
  `&scope=com.intuit.quickbooks.accounting` +
  `&state=qb-bootstrap`;

server.listen(localPort, () => {
  console.log(`Listening on port ${localPort}`);
  console.log(`Registered redirect URI: ${registeredUri}`);
  console.log('Opening browser for Intuit auth...');
  open(authUri);
});
