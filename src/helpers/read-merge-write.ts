// Generic read-merge-write for QBO entity updates.
//
// QBO's "sparse" update semantics proved unreliable in production: for several
// transaction entities a partial payload silently nulls omitted fields, and
// sparse updates that replace Line arrays are rejected outright (error 2020).
// The deterministic pattern is: GET the current entity, merge the caller's
// changes over it, and send a FULL update — so every field the caller did not
// touch is preserved exactly, and every field they did touch is forwarded.

// Fields never sent back on update: derived amounts QBO recomputes, and
// read-only metadata. TxnTaxDetail is stripped from the FETCHED entity (so tax
// is recomputed from the merged lines' TaxCodeRefs) but honored when the
// CALLER supplies it explicitly — per-invoice exact-tax overrides depend on
// that (PercentBased:false TaxLine overrides).
const STRIP_FROM_CURRENT = [
  "TxnTaxDetail",
  "TotalAmt",
  "HomeTotalAmt",
  "Balance",
  "HomeBalance",
  "MetaData",
  "domain",
  "sparse",
  "SyncToken", // the caller's token wins — stale-copy writes must 409, not succeed
] as const;

export interface ReadMergeWriteOptions {
  /** Additional fields to strip from the fetched entity before merging. */
  extraStrip?: string[];
}

/**
 * Fetch the current entity, merge `changes` over it, and return the full
 * payload to send as a non-sparse update. `getFn` is the promisified getter.
 */
export async function mergeForFullUpdate(
  getFn: (id: string) => Promise<any>,
  changes: Record<string, any>,
  options: ReadMergeWriteOptions = {}
): Promise<Record<string, any>> {
  const id = changes.Id;
  if (!id) throw new Error("read-merge-write update requires Id");
  const current = await getFn(String(id));
  const base: Record<string, any> = { ...(current ?? {}) };
  for (const field of STRIP_FROM_CURRENT) delete base[field];
  for (const field of options.extraStrip ?? []) delete base[field];
  return { ...base, ...changes, Id: String(id), sparse: false };
}

/** Promisify a node-quickbooks getter method (getBill, getPurchase, ...). */
export function promisifyGetter(quickbooks: any, getterName: string): (id: string) => Promise<any> {
  if (typeof quickbooks?.[getterName] !== "function") {
    throw new Error(`QuickBooks client has no ${getterName} method`);
  }
  return (id: string) =>
    new Promise((resolve, reject) => {
      quickbooks[getterName](id, (err: any, found: any) => (err ? reject(err) : resolve(found)));
    });
}
