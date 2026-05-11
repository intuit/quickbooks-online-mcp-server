#!/usr/bin/env node
import { spawn } from 'child_process';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const clientName = process.argv[2];

if (!clientName) {
  const clients = JSON.parse(readFileSync(join(__dirname, 'clients.json'), 'utf-8'));
  console.error('Usage: node launcher.js <client-name>\n');
  console.error('Available clients:');
  for (const [key, val] of Object.entries(clients)) {
    console.error(`  ${key}  —  ${val.name} (realm: ${val.realm_id})`);
  }
  process.exit(1);
}

const clientsPath = join(__dirname, 'clients.json');
const clients = JSON.parse(readFileSync(clientsPath, 'utf-8'));
const client = clients[clientName];

if (!client) {
  console.error(`Client "${clientName}" not found in clients.json`);
  console.error('Available:', Object.keys(clients).join(', '));
  process.exit(1);
}

const envPath = join(__dirname, '.env');
let envVars = {};
try {
  const envContent = readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) envVars[match[1]] = match[2];
  }
} catch {}

const child = spawn('node', [join(__dirname, 'dist', 'index.js')], {
  stdio: 'inherit',
  env: {
    ...process.env,
    QUICKBOOKS_CLIENT_ID: envVars.QUICKBOOKS_CLIENT_ID || process.env.QUICKBOOKS_CLIENT_ID,
    QUICKBOOKS_CLIENT_SECRET: envVars.QUICKBOOKS_CLIENT_SECRET || process.env.QUICKBOOKS_CLIENT_SECRET,
    QUICKBOOKS_REFRESH_TOKEN: client.refresh_token,
    QUICKBOOKS_REALM_ID: client.realm_id,
    QUICKBOOKS_ENVIRONMENT: envVars.QUICKBOOKS_ENVIRONMENT || 'production',
    QUICKBOOKS_REDIRECT_URI: envVars.QUICKBOOKS_REDIRECT_URI || 'http://localhost:8000/callback',
    QBO_CLIENT_NAME: clientName,
    QBO_CLIENTS_PATH: clientsPath,
  },
});

child.on('exit', (code) => process.exit(code || 0));
