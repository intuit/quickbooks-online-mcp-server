# Environment Variables Reference

This document describes all environment variables used by the QuickBooks Online MCP Server, including requirements, behavior, and differences between deployment modes.

## Quick Reference

| Variable | Mode | Required | Default | Purpose |
|----------|------|----------|---------|---------|
| `QUICKBOOKS_REALM_ID` | both | **Yes** | — | QuickBooks Company ID |
| `QUICKBOOKS_ENVIRONMENT` | both | No | `sandbox` | `sandbox` or `production` |
| `QUICKBOOKS_CLIENT_ID` | stdio | Yes* | — | OAuth2 Client ID (stdio mode only) |
| `QUICKBOOKS_CLIENT_SECRET` | stdio | Yes* | — | OAuth2 Client Secret (stdio mode only) |
| `QUICKBOOKS_REFRESH_TOKEN` | stdio | Yes* | — | OAuth2 Refresh Token (stdio mode only) |
| `QUICKBOOKS_REDIRECT_URI` | stdio | No | `http://localhost:8000/callback` | OAuth2 callback URL |
| `MCP_TRANSPORT` | both | No | `stdio` | Transport mode: `stdio` or `streamable-http` |
| `PORT` | http | No | `8000` | HTTP listen port (HTTP mode only) |
| `ALLOWED_ORIGINS` | http | **Yes** | — | Comma-separated list of allowed request origins (HTTP mode only) |

\* Required for stdio mode. Not needed in HTTP mode.

---

## Detailed Reference

### QuickBooks Configuration

#### `QUICKBOOKS_REALM_ID`
- **Required**: Yes (both modes)
- **Example**: `1234567890`
- **Description**: Your QuickBooks Online Company ID (also called Realm ID)
- **How to find**: 
  - In QuickBooks Online, go to Settings → Company Info
  - The Realm ID is displayed there
- **Behavior**: Loaded at startup, cannot change per-request. Each server instance handles one realm.

#### `QUICKBOOKS_ENVIRONMENT`
- **Required**: No
- **Default**: `sandbox`
- **Valid values**: `sandbox`, `production`
- **Description**: QuickBooks environment to connect to
- **Behavior**: 
  - `sandbox` - Use Intuit's sandbox for testing
  - `production` - Connect to live QuickBooks Online data
- **Note**: Be extremely careful with production credentials

#### `QUICKBOOKS_CLIENT_ID`
- **Required**: Yes (stdio mode only)
- **Required**: No (HTTP mode)
- **Example**: `ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnop`
- **Description**: OAuth2 Client ID from Intuit Developer Portal
- **Modes**:
  - **stdio mode**: Used to obtain and refresh access tokens
  - **HTTP mode**: Not needed (Bearer token injected externally)
- **How to get**: https://developer.intuit.com/

#### `QUICKBOOKS_CLIENT_SECRET`
- **Required**: Yes (stdio mode only)
- **Required**: No (HTTP mode)
- **Example**: `1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZabcd`
- **Description**: OAuth2 Client Secret from Intuit Developer Portal
- **Modes**:
  - **stdio mode**: Used for token requests
  - **HTTP mode**: Not needed
- **Warning**: Never commit to version control

#### `QUICKBOOKS_REFRESH_TOKEN`
- **Required**: Yes (stdio mode, after OAuth flow)
- **Required**: No (HTTP mode)
- **Description**: Long-lived OAuth2 refresh token
- **Modes**:
  - **stdio mode**: Obtained via `npm run auth` OAuth flow, cached in `.env`
  - **HTTP mode**: Not needed (Bearer token provided per-request)
- **Lifecycle**:
  - Initially obtained via browser OAuth flow (`npm run auth`)
  - Automatically saved to `.env` after successful auth
  - Used to refresh short-lived access tokens
- **Persistence**: Saved to `.env` automatically (see `.env handling` below)

#### `QUICKBOOKS_REDIRECT_URI`
- **Required**: No
- **Default**: `http://localhost:8000/callback`
- **Example**: `https://myserver.com/oauth-callback`
- **Description**: OAuth2 callback URL registered with Intuit
- **When used**: 
  - stdio mode: Browser redirects here after user authorizes
  - HTTP mode: Not used
- **Must match**: The redirect URI configured in your Intuit Developer app
- **Local development**: Leave as default (`http://localhost:8000/callback`)

---

### Transport Configuration

#### `MCP_TRANSPORT`
- **Required**: No
- **Default**: `stdio`
- **Valid values**: `stdio`, `streamable-http`
- **Description**: Communication transport for the MCP server
- **Modes**:
  - **`stdio`** (default):
    - Uses stdin/stdout for communication
    - Suitable for local development and `npx` usage
    - Requires local credentials in `.env`
    - Each user needs their own server instance
  
  - **`streamable-http`**:
    - HTTP server on configured port
    - Suitable for containerized/remote deployments
    - Bearer token validated per-request as an access gate (see `ALLOWED_ORIGINS`)
    - Stateless (new server instance per request)
    - Security: Origin allowlist validation, body size limits, graceful shutdown
    - Single shared QBO identity — all requests use the server's own env credentials

#### `PORT`
- **Required**: No
- **Default**: `8000`
- **Valid values**: `1024`-`65535`
- **Description**: HTTP listen port
- **Only used**: When `MCP_TRANSPORT=streamable-http`
- **Docker**: Container internally listens on 8000; map via `-p` flag
- **Note**: Requires elevated privileges to bind ports < 1024

#### `ALLOWED_ORIGINS`
- **Required**: Yes (HTTP mode)
- **Default**: None — all cross-origin requests are rejected if unset
- **Example**: `https://app.example.com,https://admin.example.com`
- **Description**: Comma-separated list of allowed `Origin` header values for DNS-rebinding protection
- **Only used**: When `MCP_TRANSPORT=streamable-http`
- **Behavior**: Requests whose `Origin` header is absent or not in this list receive a `403 Origin not allowed` response
- **Security**: Must be set explicitly; there is no default allowlist

---

## `.env` File Handling

### What is `.env`?
The `.env` file stores credentials and configuration locally. It is **gitignored** to prevent accidental credential commits.

### Does the Code Write to `.env`?

**Yes**, but only in **stdio mode** during OAuth authentication.

#### When `.env` is Written:
1. **OAuth Flow (`npm run auth`)**:
   - User completes OAuth authorization in browser
   - Server receives refresh token and realm ID
   - `saveTokensToEnv()` writes to `.env`:
     - `QUICKBOOKS_REFRESH_TOKEN=<token>`
     - `QUICKBOOKS_REALM_ID=<realm_id>`

2. **Token Refresh**:
   - When refresh token is rotated (less common)
   - New token is written to `.env`

#### When `.env` is NOT Written:
- **HTTP mode** (`MCP_TRANSPORT=streamable-http`):
  - Bearer token from `Authorization` header is validated as an access gate only
  - QBO API calls use the server's own credentials from environment variables
  - No local token storage
  - No `.env` writes

### `.env` Safety
- **Permissions**: Written with `mode: 0o600` (readable/writable by owner only)
- **Atomic writes**: Uses temp file + rename to prevent corruption
- **Format**: Standard `KEY=VALUE` format, one per line
- **Git**: Always in `.gitignore` — safe to commit configuration examples as `.env.example`

### Creating Initial `.env`

#### For stdio Mode:
```bash
# Create from template
cp .env.example .env

# Edit manually
nano .env
```

#### Then run OAuth flow:
```bash
npm run auth
# Opens browser, completes OAuth
# Automatically updates .env with tokens
```

#### For HTTP Mode:
No `.env` needed for runtime — use environment variables or container secrets. The Bearer token in the `Authorization` header is an access gate only; QBO credentials come from the server's own environment variables.

---

## Configuration by Deployment Mode

### Stdio Mode (Local Development)

**Requirements**:
```bash
QUICKBOOKS_REALM_ID=1234567890
QUICKBOOKS_CLIENT_ID=ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnop
QUICKBOOKS_CLIENT_SECRET=1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZabcd
QUICKBOOKS_ENVIRONMENT=sandbox
QUICKBOOKS_REDIRECT_URI=http://localhost:8000/callback
MCP_TRANSPORT=stdio  # or omit (default)
```

**Workflow**:
1. Create `.env` with Client ID, Secret, and Realm ID
2. Run `npm run auth` to complete OAuth flow
3. `QUICKBOOKS_REFRESH_TOKEN` auto-saved to `.env`
4. Server uses refresh token to obtain access tokens

### HTTP Mode (Containerized/Remote)

**Requirements**:
```bash
QUICKBOOKS_REALM_ID=1234567890
QUICKBOOKS_ENVIRONMENT=sandbox
MCP_TRANSPORT=streamable-http
PORT=8000
ALLOWED_ORIGINS=https://your-client-app.example.com
```

**Notes**:
- This server uses a **single shared QBO identity** — all QuickBooks API calls use the server's own credentials from environment variables
- The `Authorization: Bearer <token>` header is used only as a front-door access gate; the token is not forwarded to QuickBooks
- No per-user QBO credentials are needed or supported
- `.env` not needed at runtime (use Kubernetes Secrets, Docker env vars, etc.)

### Docker/Container Deployment

```bash
docker run \
  -e QUICKBOOKS_REALM_ID=1234567890 \
  -e QUICKBOOKS_ENVIRONMENT=sandbox \
  -e MCP_TRANSPORT=streamable-http \
  -e PORT=8000 \
  -e ALLOWED_ORIGINS=https://your-client-app.example.com \
  -p 8000:8000 \
  qbo-mcp-server:latest
```

**Or via Kubernetes**:
```yaml
env:
  - name: QUICKBOOKS_REALM_ID
    valueFrom:
      secretKeyRef:
        name: qbo-credentials
        key: realm-id
  - name: MCP_TRANSPORT
    value: "streamable-http"
  - name: PORT
    value: "8000"
```

---

## Environment Variable Validation

### Startup Validation

The server validates required variables on startup:

**stdio mode requires**:
- ✅ `QUICKBOOKS_CLIENT_ID`
- ✅ `QUICKBOOKS_CLIENT_SECRET`
- ✅ `QUICKBOOKS_REDIRECT_URI`

If missing, the server throws:
```
Error: Client ID, Client Secret and Redirect URI must be set in environment variables
```

**HTTP mode requires**:
- ✅ None (credentials handled externally)

**Both modes require**:
- ✅ `QUICKBOOKS_REALM_ID` (checked at request time)

### Runtime Validation

If `QUICKBOOKS_REALM_ID` is missing when a tool is called:
```
Error: QUICKBOOKS_REALM_ID environment variable is required
```

---

## Example Configurations

### Development (stdio)
```bash
# .env
QUICKBOOKS_CLIENT_ID=sample_client_id
QUICKBOOKS_CLIENT_SECRET=sample_client_secret
QUICKBOOKS_REDIRECT_URI=http://localhost:8000/callback
QUICKBOOKS_ENVIRONMENT=sandbox
QUICKBOOKS_REALM_ID=1234567890
# QUICKBOOKS_REFRESH_TOKEN will be auto-populated by 'npm run auth'
```

### Production (HTTP, Kubernetes)
```yaml
# Kubernetes Secret
apiVersion: v1
kind: Secret
metadata:
  name: qbo-config
type: Opaque
stringData:
  realm-id: "1234567890"
  environment: "production"
---
# Pod env vars
env:
  - name: QUICKBOOKS_REALM_ID
    valueFrom:
      secretKeyRef:
        name: qbo-config
        key: realm-id
  - name: QUICKBOOKS_ENVIRONMENT
    valueFrom:
      secretKeyRef:
        name: qbo-config
        key: environment
  - name: MCP_TRANSPORT
    value: "streamable-http"
  - name: PORT
    value: "8000"
```

---

## Troubleshooting

### "Client ID, Client Secret and Redirect URI must be set"
- **Cause**: stdio mode but credentials missing
- **Fix**: Set `QUICKBOOKS_CLIENT_ID`, `QUICKBOOKS_CLIENT_SECRET` in `.env`

### "QUICKBOOKS_REALM_ID environment variable is required"
- **Cause**: Realm ID not set
- **Fix**: Set `QUICKBOOKS_REALM_ID` to your QuickBooks Company ID

### "Origin not allowed"
- **Cause**: HTTP mode but `ALLOWED_ORIGINS` is not set, or the caller's origin is not in the list
- **Fix**: Set `ALLOWED_ORIGINS` to include the origin of your MCP client (e.g. `https://app.example.com`)

### "Missing or invalid Authorization header"
- **Cause**: HTTP mode but Bearer token not provided
- **Fix**: Ensure the MCP client sends `Authorization: Bearer <token>` header (token acts as access gate only; QBO calls use server credentials)

### "Request body exceeds maximum size"
- **Cause**: HTTP request payload > 1MB
- **Fix**: Reduce batch size or split large operations

### OAuth token expired or invalid
- **Cause**: Refresh token in `.env` is old/revoked
- **Fix**: Delete `QUICKBOOKS_REFRESH_TOKEN` from `.env` and run `npm run auth` again

---

## Security Best Practices

1. **Never commit `.env`** — Always in `.gitignore`
2. **Use `.env.example`** — Template with empty values for git
3. **Rotate tokens** — Refresh tokens have no expiry; rotate periodically
4. **HTTPS only** — In production, use HTTPS with proper TLS
5. **Environment-specific** — Separate `.env` files per environment
6. **Principle of least privilege** — Use scoped OAuth apps
7. **Container secrets** — Use Kubernetes Secrets, Docker secrets, or equivalent

---

## Summary Table

| Use Case | Transport | QBO Credentials | Bearer Token | `.env` | `ALLOWED_ORIGINS` |
|----------|-----------|-----------------|--------------|--------|-------------------|
| Local dev (CLI) | stdio | In `.env` | No | Yes (required) | N/A |
| Local dev (Docker) | HTTP | Server env vars | Access gate only | No | Required |
| Kubernetes | HTTP | Server env vars | Access gate only | No (use Secrets) | Required |
| CI/CD | stdio | Environment vars | No | Optional | N/A |
| Containerized | HTTP | Server env vars | Access gate only | No (env vars) | Required |
