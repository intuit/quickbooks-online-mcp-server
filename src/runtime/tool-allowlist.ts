import type { z } from "zod";
import type { ToolDefinition } from "../vendor/types/tool-definition.js";

import { GetAgedReceivablesTool } from "../vendor/tools/get-aged-receivables.tool.js";
import { GetCustomerBalanceTool } from "../vendor/tools/get-customer-balance.tool.js";
import { ReadInvoiceTool } from "../vendor/tools/read-invoice.tool.js";

// Ours, not upstream's: upstream has no void or send tool at all.
import { SendInvoiceTool } from "./tools/send-invoice.tool.js";
import { SparseUpdateInvoiceTool } from "./tools/update-invoice.tool.js";
import { VoidInvoiceTool } from "./tools/void-invoice.tool.js";

// Ours, replacing upstream's under the same names: bounded paging, enforced field
// lists, per-realm caching, and a PDF link instead of inline base64.
import { CreateInvoiceTool } from "./tools/create-invoice.tool.js";
import { GetInvoicePdfTool } from "./tools/get-invoice-pdf.tool.js";
import { GetCompanyInfoTool, GetCustomerTool, ReadItemTool } from "./tools/reference-tools.js";
import {
  SearchCustomersTool,
  SearchInvoicesTool,
  SearchItemsTool,
  SearchTaxCodesTool,
  SearchTermsTool,
} from "./tools/search-tools.js";

import { VENDORED_TOOLS } from "./vendor-tool-registry.generated.js";

/**
 * Which tools this service exposes, and how risky each one is.
 *
 * The full vendored surface is exposed: every tool from
 * intuit/quickbooks-online-mcp-server, plus the two this service adds. Upstream
 * gates writes with process-wide QUICKBOOKS_DISABLE_WRITE/UPDATE/DELETE flags read
 * at import time, which cannot express per-deployment or per-user policy, so risk
 * is data here and the calling API decides what needs approval.
 *
 * Where this service has its own implementation of a vendored tool name, ours wins
 * — see OVERRIDDEN_TOOLS. Everything else is registered straight from the vendored
 * registry, with risk derived from the tool's verb by reviewed rules below.
 */

/**
 * Mirrors the calling API's risk vocabulary so it can gate approvals without
 * having to guess from tool names.
 */
export const TOOL_RISK = {
  READ_ONLY: "READ_ONLY",
  WRITE: "WRITE",
  HIGH_RISK: "HIGH_RISK",
} as const;

export type ToolRisk = (typeof TOOL_RISK)[keyof typeof TOOL_RISK];

/**
 * Each vendored tool is `ToolDefinition<typeof itsOwnSchema>`, so a heterogeneous
 * list needs one common type. Widening the schema parameter to ZodTypeAny is
 * sound here because registration only reads name, description and schema and
 * passes the handler straight through — nothing inspects the schema's shape.
 */
export type AnyToolDefinition = ToolDefinition<z.ZodTypeAny>;

export interface AllowlistedTool {
  readonly definition: AnyToolDefinition;
  readonly risk: ToolRisk;
}

/**
 * Nothing is excluded: the whole vendored surface is exposed.
 *
 * `delete_invoice` was previously excluded because upstream's handler calls
 * deleteInvoice() first and only falls back to voiding when that fails, and a hard
 * delete destroys an accounting record. It is now exposed on request, classified
 * HIGH_RISK so the calling API requires explicit approval for every call.
 * `void_invoice` remains the correct way to cancel an invoice, because it keeps the
 * transaction auditable. The same reasoning applies to the other 19 delete tools.
 *
 * The mechanism is kept so a tool can be withdrawn again by name alone.
 */
export const EXCLUDED_TOOLS = [] as const;

/**
 * Tool names where ours replaces upstream's implementation under the same name, so
 * a re-sync that reintroduces the vendored import is caught rather than silently
 * restoring the weaker behaviour.
 *
 * create_invoice   upstream takes a raw entity and has no idempotency at all, so a
 *                  re-plan or a transport retry bills the customer twice
 * update_invoice   upstream spreads the whole invoice into a "sparse" update
 * search_*         upstream accepts `criteria: z.any()` and honours fetchAll,
 *                  and its allowed-field lists are unreachable dead code
 * get_customer     upstream does not cache, and reads are the metered half
 * read_item        same
 * get_company_info same, and upstream lets the caller name a company
 * get_invoice_pdf  upstream returns inline base64 or writes to the filesystem
 */
export const OVERRIDDEN_TOOLS = [
  "create_invoice",
  "update_invoice",
  "search_invoices",
  "search_customers",
  "search_items",
  "search_terms",
  "search_tax_codes",
  "get_customer",
  "read_item",
  "get_company_info",
  "get_invoice_pdf",
] as const;

/**
 * Reviewed, hand-written entries. These come first and win over any vendored tool
 * of the same name, either because this service implements it better or because
 * upstream has no such tool.
 */
const CURATED_TOOLS: readonly AllowlistedTool[] = [
  // Invoice reads
  { definition: ReadInvoiceTool as AnyToolDefinition, risk: TOOL_RISK.READ_ONLY },
  { definition: SearchInvoicesTool, risk: TOOL_RISK.READ_ONLY },
  { definition: GetInvoicePdfTool, risk: TOOL_RISK.READ_ONLY },

  // Invoice writes. The calling API gates these behind approval.
  // Ours: idempotent per intent, so a retry replays instead of billing twice.
  { definition: CreateInvoiceTool, risk: TOOL_RISK.WRITE },
  // Ours, not upstream's: upstream spreads the whole invoice into a "sparse" update,
  // which silently reverts concurrent edits. See tools/update-invoice.tool.ts.
  { definition: SparseUpdateInvoiceTool, risk: TOOL_RISK.WRITE },
  // Cancellation that keeps the record auditable. Preferred over delete_invoice.
  { definition: VoidInvoiceTool, risk: TOOL_RISK.WRITE },
  // Emails a customer directly and cannot be recalled, so it is not merely a WRITE.
  { definition: SendInvoiceTool, risk: TOOL_RISK.HIGH_RISK },

  // Reads an agent needs before it can compose a valid invoice.
  { definition: SearchCustomersTool, risk: TOOL_RISK.READ_ONLY },
  { definition: GetCustomerTool, risk: TOOL_RISK.READ_ONLY },
  { definition: SearchItemsTool, risk: TOOL_RISK.READ_ONLY },
  { definition: ReadItemTool, risk: TOOL_RISK.READ_ONLY },
  { definition: SearchTermsTool, risk: TOOL_RISK.READ_ONLY },
  { definition: SearchTaxCodesTool, risk: TOOL_RISK.READ_ONLY },

  // Context and receivables questions.
  { definition: GetCompanyInfoTool, risk: TOOL_RISK.READ_ONLY },
  { definition: GetAgedReceivablesTool as AnyToolDefinition, risk: TOOL_RISK.READ_ONLY },
  { definition: GetCustomerBalanceTool as AnyToolDefinition, risk: TOOL_RISK.READ_ONLY },
];

/**
 * Risk for a vendored tool, from its verb.
 *
 * Two details that matter more than they look:
 *
 * 1. Eight vendored tools are named in kebab-case (`delete-bill`, `delete-vendor`,
 *    `get-bill`, …) while the other 133 use snake_case. Matching on a `delete_`
 *    prefix alone would miss two hard-delete tools, so the separator is normalised
 *    before the verb is read.
 * 2. An unrecognised verb throws rather than defaulting. A default of READ_ONLY
 *    would mean a newly vendored tool executes with no human approval, which is
 *    exactly the failure a name-based classifier invites. Boot failure is the safe
 *    direction: it demands review of one line.
 */
export function riskForVendoredTool(toolName: string): ToolRisk {
  const verb = toolName.replace(/-/g, "_").split("_")[0];

  switch (verb) {
    case "get":
    case "search":
    case "read":
    case "list":
    case "query":
      return TOOL_RISK.READ_ONLY;

    case "create":
    case "update":
    case "void":
    case "send":
      return TOOL_RISK.WRITE;

    // Hard deletes destroy an accounting record. Never auto-approved.
    case "delete":
    case "purge":
      return TOOL_RISK.HIGH_RISK;

    default:
      throw new Error(
        `Cannot classify the risk of vendored tool "${toolName}": unrecognised verb "${verb}". ` +
          "Add it to riskForVendoredTool with a reviewed risk rather than letting it default.",
      );
  }
}

const CURATED_TOOL_NAMES: ReadonlySet<string> = new Set(
  CURATED_TOOLS.map((tool) => tool.definition.name),
);

const EXCLUDED_TOOL_NAMES: ReadonlySet<string> = new Set<string>(EXCLUDED_TOOLS);

/**
 * The full exposed surface: reviewed entries first, then every vendored tool that
 * is neither overridden by one of them nor explicitly excluded.
 */
export const ALLOWLISTED_TOOLS: readonly AllowlistedTool[] = [
  ...CURATED_TOOLS,
  ...VENDORED_TOOLS.filter(
    (tool) => !CURATED_TOOL_NAMES.has(tool.name) && !EXCLUDED_TOOL_NAMES.has(tool.name),
  ).map((tool) => ({
    definition: tool.definition,
    risk: riskForVendoredTool(tool.name),
  })),
];

/** Name to risk, built once. A linear scan per call would be wasteful at this size. */
const RISK_BY_TOOL_NAME: ReadonlyMap<string, ToolRisk> = new Map(
  ALLOWLISTED_TOOLS.map((tool) => [tool.definition.name, tool.risk]),
);

/**
 * Guards the invariants that a careless import or a re-sync would break. Called at
 * startup, so a violation fails the boot rather than surfacing as a missing or
 * misclassified tool at request time.
 */
export function assertAllowlistIntegrity(): void {
  const names = ALLOWLISTED_TOOLS.map((tool) => tool.definition.name);

  const duplicates = names.filter((name, index) => names.indexOf(name) !== index);
  if (duplicates.length > 0) {
    throw new Error(`Allowlist contains duplicate tools: ${duplicates.join(", ")}`);
  }

  const forbidden = names.filter((name) => EXCLUDED_TOOL_NAMES.has(name));
  if (forbidden.length > 0) {
    throw new Error(`Allowlist contains explicitly excluded tools: ${forbidden.join(", ")}`);
  }

  // A re-sync that drops one of our replacements would leave the tool missing
  // rather than reverted, which is quieter and therefore worse.
  const missing = OVERRIDDEN_TOOLS.filter((name) => !names.includes(name));
  if (missing.length > 0) {
    throw new Error(`Allowlist is missing tools this service overrides: ${missing.join(", ")}`);
  }

  // Each override must shadow a vendored tool of the same name. If upstream renames
  // one, the override stops replacing anything and the weaker vendored tool is gone
  // rather than superseded — silently changing behaviour.
  const vendoredNames = new Set(VENDORED_TOOLS.map((tool) => tool.name));
  const shadowingNothing = OVERRIDDEN_TOOLS.filter((name) => !vendoredNames.has(name));
  if (shadowingNothing.length > 0) {
    throw new Error(
      `These tools are marked as overriding a vendored tool, but no vendored tool has that name: ${shadowingNothing.join(", ")}`,
    );
  }

  // Every vendored tool must be exposed or deliberately excluded. Without this a
  // filter mistake would drop tools with no signal at all.
  const exposed = new Set(names);
  const dropped = VENDORED_TOOLS.map((tool) => tool.name).filter(
    (name) => !exposed.has(name) && !EXCLUDED_TOOL_NAMES.has(name),
  );
  if (dropped.length > 0) {
    throw new Error(
      `${dropped.length} vendored tools are neither exposed nor excluded: ${dropped.slice(0, 10).join(", ")}`,
    );
  }
}

export function riskOf(toolName: string): ToolRisk | undefined {
  return RISK_BY_TOOL_NAME.get(toolName);
}

/** Exposed tool count by risk. Logged at startup so the surface is visible in logs. */
export function toolSurfaceSummary(): Record<ToolRisk, number> {
  const summary: Record<ToolRisk, number> = {
    [TOOL_RISK.READ_ONLY]: 0,
    [TOOL_RISK.WRITE]: 0,
    [TOOL_RISK.HIGH_RISK]: 0,
  };
  for (const tool of ALLOWLISTED_TOOLS) summary[tool.risk] += 1;
  return summary;
}
