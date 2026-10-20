/**
 * Shared builder for sparse, patch-based update payloads.
 *
 * node-quickbooks turns an entity with `void` set into a `?include=void` request, so a
 * free-form patch must never be able to carry that key (or its own `sparse`): voiding is
 * only reachable through the two-step confirmed delete tools.
 */
const FORBIDDEN_KEYS = new Set(["void", "sparse"]);

export function cleanPatch(patch: Record<string, any>): Record<string, any> {
  const clean: Record<string, any> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (FORBIDDEN_KEYS.has(key.toLowerCase())) continue;
    clean[key] = value;
  }
  return clean;
}

/**
 * `{ Id, SyncToken (fetched), ...patch, Id, sparse: true }`. The fetched record is used only
 * for its SyncToken; none of its other values (e.g. masked tax identifiers) are sent back.
 * A caller-supplied SyncToken wins; Id and sparse never come from the caller.
 */
export function buildSparsePayload(id: string, existing: any, patch: Record<string, any>): Record<string, any> {
  return { SyncToken: existing.SyncToken, ...cleanPatch(patch), Id: id, sparse: true };
}
