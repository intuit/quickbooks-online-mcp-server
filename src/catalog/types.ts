// src/catalog/types.ts

/**
 * Configuration for a single QuickBooks entity type.
 * Defines how to interact with a QB entity including CRUD operations and response mapping.
 */
export interface EntityConfig {
  /** Human-readable singular label, e.g. "Customer" */
  label: string;
  /** Key in the QB QueryResponse object, e.g. "Customer" */
  queryResponseKey: string;
  /** node-quickbooks method names per CRUD operation */
  methods: {
    create?: string;
    get?: string;
    update?: string;
    delete?: string;
    find?: string;
  };
  /** Whether delete is a soft-delete (sets Active=false) */
  softDelete?: boolean;
}

/**
 * A single action in the catalog, discoverable via search_actions.
 * Represents a supported operation on a QuickBooks entity that Claude can invoke.
 */
export interface ActionEntry {
  /** Unique action ID, e.g. "create_customer" */
  id: string;
  /** Entity key, e.g. "customer" */
  entity: string;
  /** Operation type */
  operation: "create" | "get" | "update" | "delete" | "search" | "report";
  /** Human-readable description for Claude */
  description: string;
  /** JSON Schema describing the action's parameters (shown to Claude on search) */
  parameterHints: Record<string, string>;
  /** For report operations: the node-quickbooks method name */
  reportMethod?: string;
}
