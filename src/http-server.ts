#!/usr/bin/env node
import express from 'express';
import { randomUUID, createHash, createHmac } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const QBO_CLIENT_NAME = process.env.QBO_CLIENT_NAME || 'potluck-club';
const API_BEARER_TOKEN = process.env.API_BEARER_TOKEN;
const OAUTH_CLIENT_ID = process.env.OAUTH_CLIENT_ID;
const OAUTH_CLIENT_SECRET = process.env.OAUTH_CLIENT_SECRET;
const PORT = parseInt(process.env.PORT || '3000', 10);

const authCodes = new Map<string, { clientId: string; redirectUri: string; codeChallenge: string; expiresAt: number }>();

function createStatelessToken(clientId: string, expiresInSec: number, type: 'access' | 'refresh' = 'access'): string {
  const payload = JSON.stringify({
    cid: clientId, typ: type,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + expiresInSec,
  });
  const payloadB64 = Buffer.from(payload).toString('base64url');
  const sig = createHmac('sha256', OAUTH_CLIENT_SECRET!).update(payloadB64).digest('base64url');
  return `${payloadB64}.${sig}`;
}

function verifyStatelessToken(token: string, expectedType: 'access' | 'refresh' = 'access'): boolean {
  try {
    const dotIdx = token.indexOf('.');
    if (dotIdx < 0) return false;
    const payloadB64 = token.slice(0, dotIdx);
    const sig = token.slice(dotIdx + 1);
    const expectedSig = createHmac('sha256', OAUTH_CLIENT_SECRET!).update(payloadB64).digest('base64url');
    if (sig !== expectedSig) return false;
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());
    return payload.typ === expectedType && payload.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

let initPromise: Promise<McpServer> | null = null;
const sessions = new Map<string, { transport: StreamableHTTPServerTransport }>();

async function init(): Promise<McpServer> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY are required');
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const { data, error } = await supabase
    .from('qbo_clients')
    .select('realm_id, refresh_token')
    .eq('slug', QBO_CLIENT_NAME)
    .single();

  if (error || !data) {
    throw new Error(`Failed to load client "${QBO_CLIENT_NAME}": ${error?.message}`);
  }

  process.env.QUICKBOOKS_REFRESH_TOKEN = data.refresh_token;
  process.env.QUICKBOOKS_REALM_ID = data.realm_id;
  process.env.QBO_CLIENT_NAME = QBO_CLIENT_NAME;
  console.error(`[http] Loaded QBO client: ${QBO_CLIENT_NAME} (realm: ${data.realm_id})`);

  const { QuickbooksMCPServer } = await import('./server/qbo-mcp-server.js');
  const { RegisterTool } = await import('./helpers/register-tool.js');

  const tools = await Promise.all([
    import('./tools/create-customer.tool.js'),
    import('./tools/get-customer.tool.js'),
    import('./tools/update-customer.tool.js'),
    import('./tools/delete-customer.tool.js'),
    import('./tools/search-customers.tool.js'),
    import('./tools/create-estimate.tool.js'),
    import('./tools/get-estimate.tool.js'),
    import('./tools/update-estimate.tool.js'),
    import('./tools/delete-estimate.tool.js'),
    import('./tools/search-estimates.tool.js'),
    import('./tools/create-bill.tool.js'),
    import('./tools/update-bill.tool.js'),
    import('./tools/delete-bill.tool.js'),
    import('./tools/get-bill.tool.js'),
    import('./tools/search-bills.tool.js'),
    import('./tools/read-invoice.tool.js'),
    import('./tools/search-invoices.tool.js'),
    import('./tools/create-invoice.tool.js'),
    import('./tools/update-invoice.tool.js'),
    import('./tools/delete-invoice.tool.js'),
    import('./tools/create-account.tool.js'),
    import('./tools/get-account.tool.js'),
    import('./tools/update-account.tool.js'),
    import('./tools/search-accounts.tool.js'),
    import('./tools/read-item.tool.js'),
    import('./tools/search-items.tool.js'),
    import('./tools/create-item.tool.js'),
    import('./tools/update-item.tool.js'),
    import('./tools/delete-item.tool.js'),
    import('./tools/create-vendor.tool.js'),
    import('./tools/update-vendor.tool.js'),
    import('./tools/delete-vendor.tool.js'),
    import('./tools/get-vendor.tool.js'),
    import('./tools/search-vendors.tool.js'),
    import('./tools/create-employee.tool.js'),
    import('./tools/get-employee.tool.js'),
    import('./tools/update-employee.tool.js'),
    import('./tools/delete-employee.tool.js'),
    import('./tools/search-employees.tool.js'),
    import('./tools/create-journal-entry.tool.js'),
    import('./tools/get-journal-entry.tool.js'),
    import('./tools/update-journal-entry.tool.js'),
    import('./tools/delete-journal-entry.tool.js'),
    import('./tools/search-journal-entries.tool.js'),
    import('./tools/create-bill-payment.tool.js'),
    import('./tools/get-bill-payment.tool.js'),
    import('./tools/update-bill-payment.tool.js'),
    import('./tools/delete-bill-payment.tool.js'),
    import('./tools/search-bill-payments.tool.js'),
    import('./tools/create-purchase.tool.js'),
    import('./tools/get-purchase.tool.js'),
    import('./tools/update-purchase.tool.js'),
    import('./tools/delete-purchase.tool.js'),
    import('./tools/search-purchases.tool.js'),
    import('./tools/create-payment.tool.js'),
    import('./tools/get-payment.tool.js'),
    import('./tools/update-payment.tool.js'),
    import('./tools/delete-payment.tool.js'),
    import('./tools/search-payments.tool.js'),
    import('./tools/create-sales-receipt.tool.js'),
    import('./tools/get-sales-receipt.tool.js'),
    import('./tools/update-sales-receipt.tool.js'),
    import('./tools/delete-sales-receipt.tool.js'),
    import('./tools/search-sales-receipts.tool.js'),
    import('./tools/create-credit-memo.tool.js'),
    import('./tools/get-credit-memo.tool.js'),
    import('./tools/update-credit-memo.tool.js'),
    import('./tools/delete-credit-memo.tool.js'),
    import('./tools/search-credit-memos.tool.js'),
    import('./tools/create-refund-receipt.tool.js'),
    import('./tools/get-refund-receipt.tool.js'),
    import('./tools/update-refund-receipt.tool.js'),
    import('./tools/delete-refund-receipt.tool.js'),
    import('./tools/search-refund-receipts.tool.js'),
    import('./tools/create-purchase-order.tool.js'),
    import('./tools/get-purchase-order.tool.js'),
    import('./tools/update-purchase-order.tool.js'),
    import('./tools/delete-purchase-order.tool.js'),
    import('./tools/search-purchase-orders.tool.js'),
    import('./tools/create-vendor-credit.tool.js'),
    import('./tools/get-vendor-credit.tool.js'),
    import('./tools/update-vendor-credit.tool.js'),
    import('./tools/delete-vendor-credit.tool.js'),
    import('./tools/search-vendor-credits.tool.js'),
    import('./tools/create-deposit.tool.js'),
    import('./tools/get-deposit.tool.js'),
    import('./tools/update-deposit.tool.js'),
    import('./tools/delete-deposit.tool.js'),
    import('./tools/search-deposits.tool.js'),
    import('./tools/create-transfer.tool.js'),
    import('./tools/get-transfer.tool.js'),
    import('./tools/update-transfer.tool.js'),
    import('./tools/delete-transfer.tool.js'),
    import('./tools/search-transfers.tool.js'),
    import('./tools/create-time-activity.tool.js'),
    import('./tools/get-time-activity.tool.js'),
    import('./tools/update-time-activity.tool.js'),
    import('./tools/delete-time-activity.tool.js'),
    import('./tools/search-time-activities.tool.js'),
    import('./tools/create-class.tool.js'),
    import('./tools/get-class.tool.js'),
    import('./tools/update-class.tool.js'),
    import('./tools/search-classes.tool.js'),
    import('./tools/create-department.tool.js'),
    import('./tools/get-department.tool.js'),
    import('./tools/update-department.tool.js'),
    import('./tools/search-departments.tool.js'),
    import('./tools/create-term.tool.js'),
    import('./tools/get-term.tool.js'),
    import('./tools/update-term.tool.js'),
    import('./tools/search-terms.tool.js'),
    import('./tools/create-payment-method.tool.js'),
    import('./tools/get-payment-method.tool.js'),
    import('./tools/update-payment-method.tool.js'),
    import('./tools/search-payment-methods.tool.js'),
    import('./tools/search-budgets.tool.js'),
    import('./tools/get-tax-code.tool.js'),
    import('./tools/search-tax-codes.tool.js'),
    import('./tools/get-tax-rate.tool.js'),
    import('./tools/search-tax-rates.tool.js'),
    import('./tools/get-tax-agency.tool.js'),
    import('./tools/search-tax-agencies.tool.js'),
    import('./tools/get-company-info.tool.js'),
    import('./tools/update-company-info.tool.js'),
    import('./tools/create-attachable.tool.js'),
    import('./tools/get-attachable.tool.js'),
    import('./tools/update-attachable.tool.js'),
    import('./tools/delete-attachable.tool.js'),
    import('./tools/search-attachables.tool.js'),
    import('./tools/get-balance-sheet.tool.js'),
    import('./tools/get-profit-and-loss.tool.js'),
    import('./tools/get-cash-flow.tool.js'),
    import('./tools/get-trial-balance.tool.js'),
    import('./tools/get-general-ledger.tool.js'),
    import('./tools/get-customer-sales.tool.js'),
    import('./tools/get-aged-receivables.tool.js'),
    import('./tools/get-customer-balance.tool.js'),
    import('./tools/get-aged-payables.tool.js'),
    import('./tools/get-vendor-expenses.tool.js'),
    import('./tools/get-vendor-balance.tool.js'),
    import('./tools/list-clients.tool.js'),
    import('./tools/switch-client.tool.js'),
  ]);

  const server = QuickbooksMCPServer.GetServer();
  for (const toolModule of tools) {
    const toolDef = Object.values(toolModule).find(
      (v: any) => v && typeof v === 'object' && 'name' in v && 'handler' in v
    );
    if (toolDef) RegisterTool(server, toolDef as any);
  }

  console.error(`[http] Registered ${tools.length} tools`);
  return server;
}

function ensureInit(): Promise<McpServer> {
  if (!initPromise) initPromise = init();
  return initPromise;
}

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

function getBaseUrl(req: express.Request): string {
  const proto = req.headers['x-forwarded-proto'] || req.protocol;
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}`;
}

app.get('/.well-known/oauth-authorization-server', (req, res) => {
  const base = getBaseUrl(req);
  res.json({
    issuer: base,
    authorization_endpoint: `${base}/authorize`,
    token_endpoint: `${base}/token`,
    registration_endpoint: `${base}/register`,
    token_endpoint_auth_methods_supported: ['client_secret_post'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    response_types_supported: ['code'],
    code_challenge_methods_supported: ['S256'],
  });
});

app.get('/authorize', (req, res) => {
  const { response_type, client_id, redirect_uri, code_challenge, code_challenge_method, state } = req.query as Record<string, string>;

  if (response_type !== 'code') {
    res.status(400).json({ error: 'unsupported_response_type' });
    return;
  }

  if (client_id !== OAUTH_CLIENT_ID) {
    res.status(401).json({ error: 'invalid_client' });
    return;
  }

  const code = randomUUID();
  authCodes.set(code, {
    clientId: client_id,
    redirectUri: redirect_uri,
    codeChallenge: code_challenge,
    expiresAt: Date.now() + 600_000,
  });

  const url = new URL(redirect_uri);
  url.searchParams.set('code', code);
  if (state) url.searchParams.set('state', state);
  res.redirect(302, url.toString());
});

app.post('/register', (req, res) => {
  const { client_name, redirect_uris } = req.body || {};
  res.status(201).json({
    client_id: OAUTH_CLIENT_ID,
    client_secret: OAUTH_CLIENT_SECRET,
    client_name: client_name || 'mcp-client',
    redirect_uris: redirect_uris || [],
  });
});

app.post('/token', (req, res) => {
  const { grant_type, client_id, client_secret, code, code_verifier, redirect_uri, refresh_token } = req.body || {};

  if (!OAUTH_CLIENT_ID || !OAUTH_CLIENT_SECRET) {
    res.status(500).json({ error: 'server_error', error_description: 'OAuth not configured' });
    return;
  }

  if (grant_type === 'authorization_code') {
    if (client_id !== OAUTH_CLIENT_ID || client_secret !== OAUTH_CLIENT_SECRET) {
      res.status(401).json({ error: 'invalid_client' });
      return;
    }

    const entry = authCodes.get(code);
    if (!entry || entry.expiresAt < Date.now()) {
      if (entry) authCodes.delete(code);
      res.status(400).json({ error: 'invalid_grant' });
      return;
    }

    if (entry.clientId !== client_id) {
      res.status(401).json({ error: 'invalid_client' });
      return;
    }

    if (entry.redirectUri && entry.redirectUri !== redirect_uri) {
      res.status(400).json({ error: 'invalid_grant', error_description: 'redirect_uri mismatch' });
      return;
    }

    if (entry.codeChallenge && code_verifier) {
      const computed = createHash('sha256').update(code_verifier).digest('base64url');
      if (computed !== entry.codeChallenge) {
        res.status(400).json({ error: 'invalid_grant', error_description: 'code_verifier mismatch' });
        return;
      }
    }

    authCodes.delete(code);
  } else if (grant_type === 'refresh_token') {
    if (client_id !== OAUTH_CLIENT_ID || client_secret !== OAUTH_CLIENT_SECRET) {
      res.status(401).json({ error: 'invalid_client' });
      return;
    }
    if (!refresh_token || !verifyStatelessToken(refresh_token, 'refresh')) {
      res.status(400).json({ error: 'invalid_grant', error_description: 'invalid refresh token' });
      return;
    }
  } else if (grant_type === 'client_credentials') {
    if (client_id !== OAUTH_CLIENT_ID || client_secret !== OAUTH_CLIENT_SECRET) {
      res.status(401).json({ error: 'invalid_client' });
      return;
    }
  } else {
    res.status(400).json({ error: 'unsupported_grant_type' });
    return;
  }

  const accessExpiresIn = 86400;
  const accessToken = createStatelessToken(client_id || OAUTH_CLIENT_ID!, accessExpiresIn);
  const newRefreshToken = createStatelessToken(client_id || OAUTH_CLIENT_ID!, 2592000, 'refresh');

  res.json({
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: accessExpiresIn,
    refresh_token: newRefreshToken,
  });
});

app.use('/mcp', (req, res, next) => {
  const auth = req.headers.authorization;
  const bearerToken = auth?.startsWith('Bearer ') ? auth.slice(7) : null;

  // No auth configured — allow all
  if (!API_BEARER_TOKEN && !OAUTH_CLIENT_ID) {
    next();
    return;
  }

  if (!bearerToken) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  // Check static bearer token
  if (API_BEARER_TOKEN && bearerToken === API_BEARER_TOKEN) {
    next();
    return;
  }

  if (verifyStatelessToken(bearerToken)) {
    next();
    return;
  }

  res.status(401).json({ error: 'Unauthorized' });
});

app.post('/mcp', async (req, res) => {
  const server = await ensureInit();
  const sessionId = req.headers['mcp-session-id'] as string | undefined;

  if (sessionId && sessions.has(sessionId)) {
    const session = sessions.get(sessionId)!;
    await session.transport.handleRequest(req, res, req.body);
    return;
  }

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
  });

  transport.onclose = () => {
    const sid = transport.sessionId;
    if (sid) sessions.delete(sid);
  };

  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);

  if (transport.sessionId) {
    sessions.set(transport.sessionId, { transport });
  }
});

app.get('/mcp', async (req, res) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  if (!sessionId || !sessions.has(sessionId)) {
    res.status(400).json({ error: 'Invalid or missing session ID' });
    return;
  }
  const session = sessions.get(sessionId)!;
  await session.transport.handleRequest(req, res);
});

app.delete('/mcp', async (req, res) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  if (sessionId && sessions.has(sessionId)) {
    const session = sessions.get(sessionId)!;
    await session.transport.handleRequest(req, res);
    sessions.delete(sessionId);
  } else {
    res.status(200).end();
  }
});

app.get('/cron/keep-alive', async (req, res) => {
  const authHeader = req.headers.authorization;
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
  const clientId = process.env.QUICKBOOKS_CLIENT_ID;
  const clientSecret = process.env.QUICKBOOKS_CLIENT_SECRET;

  if (!supabaseUrl || !supabaseKey || !clientId || !clientSecret) {
    res.status(500).json({ error: 'Missing required environment variables' });
    return;
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const { data: clients, error } = await supabase
    .from('qbo_clients')
    .select('slug, realm_id, refresh_token')
    .order('slug');

  if (error || !clients) {
    res.status(500).json({ error: `Failed to load clients: ${error?.message}` });
    return;
  }

  const OAuthClient = (await import('intuit-oauth')).default;
  const results: { slug: string; status: 'ok' | 'error'; message?: string; refreshDaysLeft?: number }[] = [];

  for (const client of clients) {
    try {
      const oauth = new OAuthClient({
        clientId,
        clientSecret,
        environment: process.env.QUICKBOOKS_ENVIRONMENT || 'production',
        redirectUri: process.env.QUICKBOOKS_REDIRECT_URI || 'http://localhost:8000/callback',
      });

      const response = await oauth.refreshUsingToken(client.refresh_token);
      const token = response.token as any;

      const update: Record<string, string> = { updated_at: new Date().toISOString() };
      if (token.refresh_token && token.refresh_token !== client.refresh_token) {
        update.refresh_token = token.refresh_token;
      }

      await supabase
        .from('qbo_clients')
        .update(update)
        .eq('slug', client.slug);

      const refreshDaysLeft = typeof token.x_refresh_token_expires_in === 'number'
        ? Math.round(token.x_refresh_token_expires_in / 86400)
        : undefined;

      results.push({ slug: client.slug, status: 'ok', refreshDaysLeft });
    } catch (err: any) {
      results.push({ slug: client.slug, status: 'error', message: err.message });
    }
  }

  const ok = results.filter(r => r.status === 'ok').length;
  const failed = results.filter(r => r.status === 'error');
  console.error(`[keep-alive] ${ok}/${clients.length} refreshed, ${failed.length} failed`);

  res.json({
    total: clients.length,
    ok,
    failed: failed.length,
    results,
  });
});

app.get('/health', async (_req, res) => {
  try {
    await ensureInit();
    res.json({ status: 'ok', client: QBO_CLIENT_NAME, sessions: sessions.size });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// Local dev: listen on PORT. On Vercel: export the app.
if (!process.env.VERCEL) {
  ensureInit().then(() => {
    app.listen(PORT, () => {
      console.error(`[http] QBO MCP server listening on port ${PORT}`);
      console.error(`[http] Client: ${QBO_CLIENT_NAME}`);
      console.error(`[http] Auth: ${API_BEARER_TOKEN ? 'enabled' : 'disabled'}`);
    });
  }).catch((err) => {
    console.error('[http] Fatal:', err);
    process.exit(1);
  });
}

export default app;
