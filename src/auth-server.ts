#!/usr/bin/env node
/**
 * QuickBooks OAuth Authentication Server
 *
 * Fix for Issue #6: This script was missing, causing `npm run auth` to fail.
 *
 * Usage: npm run auth
 *
 * This script initiates the OAuth 2.0 flow to obtain QuickBooks API tokens.
 * It will:
 * 1. Start a local server on port 8000
 * 2. Open your browser to the QuickBooks authorization page
 * 3. Handle the callback and save tokens to .env
 * 4. Close automatically when complete
 *
 * Prerequisites:
 * - QUICKBOOKS_CLIENT_ID and QUICKBOOKS_CLIENT_SECRET must be set in .env
 * - QUICKBOOKS_REDIRECT_URI must be registered exactly in your Intuit app
 */

import { quickbooksClient } from './clients/quickbooks-client.js';

async function main() {
  const profile = process.env.QUICKBOOKS_PROFILE;
  const envFile = process.env.QUICKBOOKS_ENV_FILE || (profile ? `.env.${profile}` : '.env');
  const redirectUri =
    process.env.QUICKBOOKS_REDIRECTURI ||
    process.env.QUICKBOOKS_REDIRECT_URI ||
    'http://localhost:8000/callback';

  console.log('QuickBooks OAuth Authentication');
  console.log('================================\n');
  console.log('Starting OAuth flow...');
  console.log('A browser window will open for you to authorize the application.\n');

  try {
    // The authenticate method will trigger the OAuth flow if no tokens exist
    await quickbooksClient.authenticate();

    console.log('\n✓ Successfully authenticated with QuickBooks!');
    console.log(`Tokens have been saved to ${envFile}.`);
    console.log('\nYou can now use the MCP server.');

    process.exit(0);
  } catch (error) {
    console.error('\n✗ Authentication failed:', error);
    console.error('\nPlease check:');
    console.error(`1. QUICKBOOKS_CLIENT_ID is set correctly in ${envFile}`);
    console.error(`2. QUICKBOOKS_CLIENT_SECRET is set correctly in ${envFile}`);
    console.error(`3. ${redirectUri} is registered as a redirect URI in your Intuit app`);

    process.exit(1);
  }
}

main();
