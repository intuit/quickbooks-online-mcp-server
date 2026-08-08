# Design: Token sidecar persistence (fixes #117)

## Problem

`19c90be` persists a rotated refresh token via `saveTokensToEnv()`, writing it into `.env`. For the normal MCP deployment shape — credentials supplied as environment variables through the host's own config (`claude_desktop_config.json`, `.mcp.json`, a container's `env` block) — that write is never read back:

1. The server cannot write to the host's config file; it doesn't know where it lives, and it isn't `.env`.
2. `dotenv.config()` never overrides a variable already present in `process.env`, so the host-supplied `QUICKBOOKS_REFRESH_TOKEN` always wins at the next startup.

Rotation is silently lost on every restart. Once Intuit stops accepting the previously issued token, refresh fails with `invalid_grant` and the integration needs manual re-authentication — exactly the failure `19c90be` set out to prevent.

## Approach

Add a sidecar file, `tokens.json`, colocated with `.env` in the server's install root (same directory resolution `saveTokensToEnv` already uses, `__dirname/../../`). Override path via `QUICKBOOKS_TOKEN_STORE_PATH`.

This placement (rather than `$HOME`) is deliberate: any deployment that already solves `.env` persistence — a symlink into a mounted volume, a container's persistent-volume mount (the exact case fixed for `.env` in #63) — gets `tokens.json` persistence for free, same directory, no additional mount config. A homedir-based sidecar would need its own separate persistence story, reintroducing the class of bug this fix addresses.

This also matches existing codebase precedent: `src/helpers/attachable-file-source.ts` (merged in #97, unrelated PR) already denies uploads named `tokens.json` with the comment *"the server's own install tree (which holds `.env` and `tokens.json` for a QBO company)"* — the install-root sidecar was already anticipated.

### Schema

```json
{
  "refreshToken": "<latest rotated token>",
  "realmId": "<latest realm id>",
  "descendedFrom": "<refresh token value the chain started from>",
  "updatedAt": "<ISO timestamp>"
}
```

`descendedFrom` is the `QUICKBOOKS_REFRESH_TOKEN` value read from the host env/`.env` at the point the current rotation chain began. It stays fixed across rotations, and is the mechanism that keeps a stale sidecar from silently overriding a manual re-auth: if an operator pastes a new token into their host config, `descendedFrom` no longer matches, and the sidecar is ignored in favor of the freshly configured value.

## Startup resolution

Runs at module init, replacing today's direct `const refresh_token = process.env.QUICKBOOKS_REFRESH_TOKEN` read:

```
configuredToken = process.env.QUICKBOOKS_REFRESH_TOKEN   (post dotenv.config)
sidecar = loadTokenSidecar()   // null on missing/corrupt/unreadable

if sidecar && configuredToken && sidecar.descendedFrom === configuredToken:
    resolvedRefreshToken = sidecar.refreshToken
    resolvedRealmId      = sidecar.realmId ?? env realmId
    chainRoot             = sidecar.descendedFrom      // trusted, unchanged
else:
    resolvedRefreshToken = configuredToken               // host config wins
    chainRoot             = configuredToken               // chain reset
```

`chainRoot` is stored as a new private field on `QuickbooksClient` (`tokenChainRoot`), needed at rotation time to write `descendedFrom` correctly.

First-run OAuth (no `configuredToken` at all) is unaffected by this block — falls through to the existing `startOAuthFlow()`. After OAuth succeeds, `tokenChainRoot` is set to the freshly obtained refresh token itself (there's no prior host-config value to compare against).

## Persistence on rotation

`refreshAccessToken()`, on new refresh token detected (unchanged trigger: `newRefreshToken !== this.refreshToken`):

```
this.refreshToken = newRefreshToken
saveTokensToEnv()                                    // existing, unchanged
saveTokenSidecar({
  refreshToken: newRefreshToken,
  realmId: this.realmId,
  descendedFrom: this.tokenChainRoot,                 // unchanged across rotations
  updatedAt: now
})
```

Both writes are independently try/caught — same pattern as today's `.env` write: a disk failure logs and continues, never fails the refresh itself (the in-memory token is still valid for the running process).

The `startOAuthFlow` success handler gets the same `saveTokenSidecar()` call added alongside its existing `saveTokensToEnv()`, with `descendedFrom` set to the newly obtained token.

## Error handling & write mechanics

Sidecar write mirrors `saveTokensToEnv`'s existing atomic pattern:

- Regular file: temp file (`tokens.json.tmp.<pid>`) + `renameSync`, mode `0o600`.
- Symlinked `tokens.json`: write through to the `realpathSync` target (same dangling-symlink fallback as `.env` — a relative `readlinkSync` target is resolved against the link's own directory, not `process.cwd()`).
- `mkdirSync(dir, { recursive: true })` first if `QUICKBOOKS_TOKEN_STORE_PATH` points somewhere the install root doesn't already guarantee exists.

Sidecar read (`loadTokenSidecar`, at module init):

- File missing → returns `null` silently (expected on first run, or upgrading from a version without this feature).
- JSON parse failure or permission error → returns `null`, logs a warning (`[qbo-client] Failed to read token sidecar, ignoring: <reason>`). Never throws — startup must not hard-fail because of a corrupt sidecar; falls back to `configuredToken`, same as the no-sidecar case.

## Testing

New `tests/unit/clients/token-sidecar.test.ts`, following the existing `jest.unstable_mockModule('fs', …)` pattern from `save-tokens-to-env.test.ts`:

1. No sidecar file → resolves `configuredToken`, trust logic not engaged.
2. Sidecar present, `descendedFrom === configuredToken` → resolves `sidecar.refreshToken` (chain trusted).
3. Sidecar present, `descendedFrom !== configuredToken` (operator pasted new token) → `configuredToken` wins, stale sidecar ignored, chain reset.
4. Corrupt sidecar JSON → falls back to `configuredToken`, doesn't throw, logs warning.
5. Rotation writes sidecar with `descendedFrom` unchanged across multiple successive rotations.
6. First-run OAuth (no `configuredToken`) → sidecar written post-flow with `descendedFrom` = newly obtained token.
7. Symlinked `tokens.json` → write-through to target path (mirrors existing `.env` symlink tests; logic is shared with `saveTokensToEnv`, one case suffices).

`tests/unit/clients/save-tokens-to-env.test.ts` is unaffected — it stays scoped to `.env` write behavior only.

## Out of scope

- The simpro-mcp / qbo-mcp server merge (separate spec, sequenced after this one per user request).
- Issue #68 (dead stored token, no interactive fallback) — explicitly a different failure mode per the issue text.
- Dependency vulnerabilities (#115), error-payload sanitization (#99), input validation (#98) — separate issues, own specs if pursued.
