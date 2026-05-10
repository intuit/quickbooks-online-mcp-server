# QuickBooks Auth Bootstrap (Normalized)

## Objective
Use a **single source of truth** for QuickBooks OAuth credentials/tokens so both MCP servers (`quickbooks`, `quickbooks-reports`) stay in sync.

## Canonical env file

Use one file only:

- `~/mcp-servers/quickbooks/.env`

Optional explicit override:

- `QUICKBOOKS_ENV_FILE=/absolute/path/to/.env`

Both servers now resolve env using the same path order:
1. `QUICKBOOKS_ENV_FILE` (if set)
2. `~/mcp-servers/quickbooks/.env`
3. `~/.quickbooks/.env`
4. `./.env` (last resort)

## Required variables (startup validation)

- `QUICKBOOKS_CLIENT_ID`
- `QUICKBOOKS_CLIENT_SECRET`
- `QUICKBOOKS_REFRESH_TOKEN`
- `QUICKBOOKS_REALM_ID`

If any are missing, startup hard-fails with diagnostics:
- loaded env path
- missing vars
- search paths checked

## Rolling refresh token behavior

QuickBooks rotates refresh tokens. Both servers must persist refreshed token back to the same env file.

Normalized behavior:
- `quickbooks` now persists rotated refresh tokens
- `quickbooks-reports` already persisted rotated refresh tokens

## One-time re-auth (if refresh token is invalid)

If you hit `invalid_grant`, run:

```bash
cd ~/mcp-servers/quickbooks
QUICKBOOKS_ENV_FILE=~/mcp-servers/quickbooks/.env \
  node scripts/bootstrap-qb-oauth.mjs
```

This opens Intuit auth and writes new `QUICKBOOKS_REFRESH_TOKEN` + `QUICKBOOKS_REALM_ID` to the shared env file.

## Health-check routine (Audra context)

```bash
mcporter --config ~/.claude/agents/audra/config/mcporter.json list quickbooks
mcporter --config ~/.claude/agents/audra/config/mcporter.json list quickbooks-reports

mcporter --config ~/.claude/agents/audra/config/mcporter.json \
  call quickbooks.search_accounts params='{"criteria":{},"limit":1}'

mcporter --config ~/.claude/agents/audra/config/mcporter.json \
  call quickbooks-reports.get_profit_and_loss params='{"start_date":"2026-01-01","end_date":"2026-01-31"}'
```

## Rollback

If bootstrap changes cause issues:
1. Revert `src/clients/env-bootstrap.ts` and `src/clients/quickbooks-client.ts`
2. Rebuild: `npm run build`
3. Remove `QUICKBOOKS_ENV_FILE` from agent configs (if added)
4. Restart mcporter daemon for affected agents

> Note: rollback restores old behavior but also restores split-brain token risk.
