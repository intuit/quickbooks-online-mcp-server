import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ToolDefinition } from "../types/tool-definition.js";
import { z } from "zod";
import { injectQboLinkIntoContent } from "./qbo-entity-link.js";

/**
 * Defines CRUD categories for tools
 */
export const CRUD_CATEGORY = {
  WRITE:  "WRITE",
  UPDATE: "UPDATE",
  DELETE: "DELETE",
  READ:   "READ",
} as const;

export type CrudCategory = typeof CRUD_CATEGORY[keyof typeof CRUD_CATEGORY];

/** 
 * Maps each CRUD category to its corresponding environment variable for disabling tools.
 */
export const DISABLE_ENV = {
  [CRUD_CATEGORY.WRITE]:  "QUICKBOOKS_DISABLE_WRITE",
  [CRUD_CATEGORY.UPDATE]: "QUICKBOOKS_DISABLE_UPDATE",
  [CRUD_CATEGORY.DELETE]: "QUICKBOOKS_DISABLE_DELETE",
} as const;

/** 
 * Maps every non-READ verb prefix to its category. Handles both underscore
 * and legacy hyphen separator variants (e.g. create-bill, update-vendor).
 * Insertion order is preserved in V8; all prefixes are distinct so order
 * does not affect correctness.
 */
export const PREFIX_CATEGORY_MAP: Record<string, CrudCategory> = {
  "create_": CRUD_CATEGORY.WRITE,
  "create-": CRUD_CATEGORY.WRITE,
  "update_": CRUD_CATEGORY.UPDATE,
  "update-": CRUD_CATEGORY.UPDATE,
  "delete_": CRUD_CATEGORY.DELETE,
  "delete-": CRUD_CATEGORY.DELETE,
};

/** 
 * Determines the CRUD category of a tool based on its name prefix.
 * Defaults to READ if no prefix matches.
 */
export function getCrudCategory(toolName: string): CrudCategory {
  for (const [prefix, category] of Object.entries(PREFIX_CATEGORY_MAP)) {
    if (toolName.startsWith(prefix)) return category;
  }
  return CRUD_CATEGORY.READ;
}

/** 
 * Checks if a tool is disabled based on its CRUD category and corresponding environment variable.
 * READ tools are never disabled.
 */
export function isToolDisabled(toolName: string): boolean {
  const category = getCrudCategory(toolName);
  if (category === CRUD_CATEGORY.READ) return false;
  return process.env[DISABLE_ENV[category]] === "true";
}

/** 
 * Registers a tool with the MCP server if it is not disabled.
 * Tools are categorized by their name prefix (e.g. create_, update_, delete_).
 * The corresponding environment variable (e.g. QUICKBOOKS_DISABLE_WRITE) determines if the tool is registered.
 */
export function RegisterTool<T extends z.ZodType<any, any>>(
  server: McpServer,
  toolDefinition: ToolDefinition<T>
) {
  if (isToolDisabled(toolDefinition.name)) return;

  // For create_/update_ tools, append a qbo_link deep link (prefixed with the
  // company name — txnId resolves against the browser's ACTIVE company, so the
  // user must be able to confirm the header) to the JSON response. Centralized
  // here so every transaction tool gets it uniformly. Failures never break the
  // underlying response.
  const category = getCrudCategory(toolDefinition.name);
  const baseHandler = toolDefinition.handler as unknown as (...a: any[]) => Promise<any>;
  const wrapped = async (...a: any[]) => {
    const result = await baseHandler(...a);
    try {
      if (result && Array.isArray(result.content)) {
        await injectQboLinkIntoContent(toolDefinition.name, result.content);
      }
    } catch {
      /* link injection is best-effort — never fail the tool call */
    }
    return result;
  };
  const handler = (
    category === CRUD_CATEGORY.WRITE || category === CRUD_CATEGORY.UPDATE ? wrapped : baseHandler
  ) as typeof toolDefinition.handler;

  server.tool(toolDefinition.name, toolDefinition.description, { params: toolDefinition.schema }, handler);

  // Legacy hyphenated names (create-bill, update-vendor, ...) get an
  // underscore alias (create_bill, ...) for naming consistency with the rest
  // of the surface. The hyphen name stays registered for backward compat.
  if (toolDefinition.name.includes("-")) {
    const alias = toolDefinition.name.replace(/-/g, "_");
    server.tool(
      alias,
      `${toolDefinition.description} (Alias of ${toolDefinition.name}.)`,
      { params: toolDefinition.schema },
      handler
    );
  }
}