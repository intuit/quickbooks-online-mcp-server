import { QuickbooksClient } from "../clients/quickbooks-client.js";

// QBO web-app deep-link slugs per entity. txnId resolves against whichever
// company is ACTIVE IN THE USER'S BROWSER SESSION, not the realm this MCP
// instance is bound to — which is why every link is prefixed with the company
// name, so the user can confirm the QBO header matches before acting.
const ENTITY_SLUGS: Record<string, string> = {
  bill: "bill",
  purchase: "expense",
  expense: "expense",
  cheque: "check",
  check: "check",
  transfer: "transfer",
  journal_entry: "journal",
  journalentry: "journal",
  journal: "journal",
  bill_payment: "billpayment",
  billpayment: "billpayment",
  deposit: "deposit",
  payment: "recvpayment",
  customer_payment: "recvpayment",
  invoice: "invoice",
  credit_memo: "creditmemo",
  creditmemo: "creditmemo",
  vendor_credit: "vendorcredit",
  vendorcredit: "vendorcredit",
};

export function supportedLinkEntityTypes(): string[] {
  return Object.keys(ENTITY_SLUGS).sort();
}

// Company name cache — resolved once per process, lazily (never at module
// load: a network call in a constructor would delay server startup).
let companyNamePromise: Promise<string> | null = null;

async function fetchCompanyName(): Promise<string> {
  const quickbooks: any = await QuickbooksClient.getInstance();
  const { realmId } = await QuickbooksClient.getAuthCredentials();
  return new Promise((resolve) => {
    quickbooks.getCompanyInfo(realmId, (err: any, info: any) => {
      if (err || !info) resolve("Unknown company");
      else resolve(info.CompanyName ?? "Unknown company");
    });
  });
}

export function getCachedCompanyName(): Promise<string> {
  if (!companyNamePromise) {
    companyNamePromise = fetchCompanyName().catch(() => {
      companyNamePromise = null; // allow a retry on the next call
      return "Unknown company";
    });
  }
  return companyNamePromise;
}

/** Test seam: reset the company-name cache. */
export function resetCompanyNameCache(): void {
  companyNamePromise = null;
}

/**
 * Build the QBO web deep link for an entity, prefixed with the company name:
 *   "[Example Company Inc.] https://qbo.intuit.com/app/bill?txnId=123"
 * Returns undefined for entity types without a known web slug.
 */
export async function buildQboLink(entityType: string, id: string): Promise<string | undefined> {
  const slug = ENTITY_SLUGS[entityType.toLowerCase().replace(/[\s-]/g, "_")];
  if (!slug || !id) return undefined;
  const company = await getCachedCompanyName();
  return `[${company}] https://qbo.intuit.com/app/${slug}?txnId=${encodeURIComponent(id)}`;
}

// Map a create_/update_ tool name to the entity type used for deep links.
// Only transaction entities QBO exposes web deep links for are mapped —
// list entities (vendor, customer, item, account, ...) have no txnId page.
const TOOL_ENTITY_MAP: Array<[RegExp, string]> = [
  [/^(create|update)[-_]bill[-_]payment$/, "billpayment"],
  [/^(create|update)[-_]bill$/, "bill"],
  [/^(create|update)[-_]purchase$/, "expense"],
  [/^(create|update)[-_]transfer$/, "transfer"],
  [/^(create|update)[-_]journal[-_]entry$/, "journal"],
  [/^(create|update)[-_]deposit$/, "deposit"],
  [/^(create|update)[-_]payment$/, "recvpayment"],
  [/^(create|update)[-_]invoice$/, "invoice"],
  [/^(create|update)[-_]credit[-_]memo$/, "creditmemo"],
  [/^(create|update)[-_]vendor[-_]credit$/, "vendorcredit"],
];

export function entityTypeForTool(toolName: string): string | undefined {
  for (const [pattern, entity] of TOOL_ENTITY_MAP) {
    if (pattern.test(toolName)) return entity;
  }
  return undefined;
}

/**
 * Inject a qbo_link field into a create_/update_ tool's JSON response text.
 * Finds the first JSON-object content item, extracts the entity Id (handling
 * both bare entities and {Entity: {...}} wrappers), and adds qbo_link.
 * Non-JSON or Id-less responses are returned untouched — never throws.
 */
export async function injectQboLinkIntoContent(
  toolName: string,
  content: Array<{ type: string; text?: string }>
): Promise<void> {
  const entityType = entityTypeForTool(toolName);
  if (!entityType) return;
  for (const item of content) {
    if (item.type !== "text" || !item.text || !item.text.trim().startsWith("{")) continue;
    try {
      const parsed = JSON.parse(item.text);
      const entity =
        parsed && typeof parsed === "object" && !parsed.Id
          ? Object.values(parsed).find((v: any) => v && typeof v === "object" && v.Id)
          : parsed;
      const id = (entity as any)?.Id;
      if (!id) return;
      const link = await buildQboLink(entityType, String(id));
      if (!link) return;
      parsed.qbo_link = link;
      const pretty = item.text.includes("\n");
      item.text = pretty ? JSON.stringify(parsed, null, 2) : JSON.stringify(parsed);
      return; // only the first JSON payload gets the link
    } catch {
      return; // malformed JSON — leave the response untouched
    }
  }
}
