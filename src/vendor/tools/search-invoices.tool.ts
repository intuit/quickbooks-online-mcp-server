import { searchQuickbooksInvoices } from "../handlers/search-quickbooks-invoices.handler.js";
import { ToolDefinition } from "../types/tool-definition.js";
import { z } from "zod";

const toolName = "search_invoices";
const toolDescription = "Search invoices in QuickBooks Online using criteria (maps to node-quickbooks findInvoices).";

// ALLOWED FIELD LISTS (derived from Quickbooks Invoice entity docs – Filterable and Sortable columns)
const ALLOWED_FILTER_FIELDS = [
  "Id",
  "MetaData.CreateTime",
  "MetaData.LastUpdatedTime",
  "DocNumber",
  "TxnDate",
  "DueDate",
  "CustomerRef",
  "ClassRef",
  "DepartmentRef",
  "Balance",
  "TotalAmt",
] as const;

const ALLOWED_SORT_FIELDS = [
  "Id",
  "MetaData.CreateTime",
  "MetaData.LastUpdatedTime",
  "DocNumber",
  "TxnDate",
  "Balance",
  "TotalAmt",
] as const;

// FIELD TYPE MAP
const FIELD_TYPE_MAP = {
  "Id": "string",
  "MetaData.CreateTime": "date",
  "MetaData.LastUpdatedTime": "date",
  "DocNumber": "string",
  "TxnDate": "date",
  "DueDate": "date",
  "CustomerRef": "string",
  "ClassRef": "string",
  "DepartmentRef": "string",
  "Balance": "number",
  "TotalAmt": "number",
} as const;

// Helper function to check if the value type matches the expected type for the field
const isValidInvoiceValueType = (field: string, value: any): boolean => {
  const expectedType = FIELD_TYPE_MAP[field as keyof typeof FIELD_TYPE_MAP];
  return typeof value === expectedType;
};

// Zod schemas that validate the fields against the white-lists
const filterableFieldSchema = z
  .string()
  .refine((val) => (ALLOWED_FILTER_FIELDS as readonly string[]).includes(val), {
    message: `Field must be one of: ${ALLOWED_FILTER_FIELDS.join(", ")}`,
  });

const sortableFieldSchema = z
  .string()
  .refine((val) => (ALLOWED_SORT_FIELDS as readonly string[]).includes(val), {
    message: `Sort field must be one of: ${ALLOWED_SORT_FIELDS.join(", ")}`,
  });

// Criteria can be advanced
const operatorSchema = z.enum(["=", "IN", "<", ">", "<=", ">=", "LIKE"]).optional();
const filterSchema = z.object({
  field: filterableFieldSchema,
  value: z.any(),
  operator: operatorSchema,
}).superRefine((obj, ctx) => {
  if (!isValidInvoiceValueType(obj.field as string, obj.value)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Value type does not match expected type for field ${obj.field}`,
    });
  }
});

const advancedCriteriaSchema = z.object({
  filters: z.array(filterSchema).optional(),
  asc: sortableFieldSchema.optional(),
  desc: sortableFieldSchema.optional(),
  limit: z.number().optional(),
  offset: z.number().optional(),
  count: z.boolean().optional(),
  fetchAll: z.boolean().optional(),
});

// Runtime schema used internally for validation
const RUNTIME_CRITERIA_SCHEMA = z.union([
  z.record(z.any()),
  z.array(z.record(z.any())),
  advancedCriteriaSchema,
]);

// Exposed schema – use broad type to prevent deep $ref issues
const toolSchema = z.object({ criteria: z.any() });

const toolHandler = async ({ params }: any) => {
  const { criteria } = params;

  // Validate runtime schema
  const parsed = RUNTIME_CRITERIA_SCHEMA.safeParse(criteria);
  if (!parsed.success) {
    return {
      content: [
        { type: "text" as const, text: `Invalid criteria: ${parsed.error.message}` },
      ],
    };
  }

  const response = await searchQuickbooksInvoices(criteria);

  if (response.isError) {
    return {
      content: [
        { type: "text" as const, text: `Error searching invoices: ${response.error}` },
      ],
    };
  }
  const invoices = response.result;
  return {
    content: [
      { type: "text" as const, text: `Found ${invoices?.length || 0} invoices` },
      ...(invoices?.map((inv) => ({ type: "text" as const, text: JSON.stringify(inv) })) || []),
    ],
  };
};

export const SearchInvoicesTool: ToolDefinition<typeof toolSchema> = {
  name: toolName,
  description: toolDescription,
  schema: toolSchema,
  handler: toolHandler,
}; 