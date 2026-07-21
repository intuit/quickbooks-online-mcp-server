import { searchQuickbooksBills } from "../handlers/search-quickbooks-bills.handler.js";
import { ToolDefinition } from "../types/tool-definition.js";
import { z } from "zod";
import { shapeSearchResults } from "../helpers/build-quickbooks-search-criteria.js";

const toolName = "search_bills";
const toolDescription = "Search bills in QuickBooks Online that match given criteria.";

// A subset of commonly-used Bill fields that can be filtered on.
// This is *not* an exhaustive list, but provides helpful IntelliSense / docs
// to users of the tool. Any field returned in the Quickbooks Bill entity is
// technically valid.
const billFieldEnum = z.enum([
  "Id",
  "SyncToken",
  "MetaData.CreateTime",
  "MetaData.LastUpdatedTime",
  "TxnDate",
  "DueDate", 
  "Balance",
  "TotalAmt",
  "VendorRef",
  "APAccountRef",
  "DocNumber",
  "PrivateNote",
  "ExchangeRate",
  "DepartmentRef",
  "CurrencyRef"
]).describe(
  "Field to filter on – must be a property of the QuickBooks Online Bill entity."
);

const criterionSchema = z.object({
  key: z.string().describe("Simple key (legacy) – any Bill property name."),
  value: z.union([z.string(), z.number(), z.boolean(), z.array(z.union([z.string(), z.number()]))]),
});

// Advanced criterion schema with operator support.
const advancedCriterionSchema = z.object({
  field: billFieldEnum,
  value: z.union([z.string(), z.number(), z.boolean(), z.array(z.union([z.string(), z.number()]))]),
  operator: z
    .enum(["=", "<", ">", "<=", ">=", "LIKE", "IN"])
    .optional()
    .describe("Comparison operator. Defaults to '=' if omitted."),
});

const toolSchema = z.object({
  // Allow advanced criteria array like [{field,value,operator}]
  criteria: z
    .array(advancedCriterionSchema.or(criterionSchema))
    .optional()
    .describe(
      "Filters to apply. Use the advanced form {field,value,operator?} for operators or the simple {key,value} pairs."
    ),

  limit: z.number().optional(),
  offset: z.number().optional(),
  asc: z.string().optional(),
  desc: z.string().optional(),
  fetchAll: z.boolean().optional(),
  count: z.boolean().optional(),
  fields: z.array(z.string()).optional().describe("Project results to these dot-path fields (e.g. ['Id','TotalAmt','VendorRef.name'])"),
  summary: z.boolean().optional().describe("Return one compact line per entity (Id, DocNumber, refs, TxnDate, TotalAmt, Balance)"),
});

export const SearchBillsTool: ToolDefinition<typeof toolSchema> = {
  name: toolName,
  description: toolDescription,
  schema: toolSchema,
  handler: async (args) => {
    const { criteria = [], fields, summary, ...options } = (args.params ?? {}) as z.infer<typeof toolSchema>;

    // build criteria to pass to SDK, supporting advanced operator syntax
    let criteriaToSend: any;
    if (Array.isArray(criteria) && criteria.length > 0) {
      const first = criteria[0] as any;
      if (typeof first === "object" && "field" in first) {
        criteriaToSend = [...criteria, ...Object.entries(options).map(([key, value]) => ({ field: key, value }))];
      } else {
        criteriaToSend = (criteria as Array<{ key: string; value: any }>).reduce<Record<string, any>>((acc, { key, value }) => {
          if (value !== undefined && value !== null) acc[key] = value;
          return acc;
        }, { ...options });
      }
    } else {
      criteriaToSend = { ...options };
    }

    const response = await searchQuickbooksBills(criteriaToSend);
    if (response.isError) {
      return {
        content: [{ type: "text" as const, text: `Error searching bills: ${response.error}` }],
      };
    }
    const shaped = Array.isArray(response.result) ? shapeSearchResults(response.result, { fields, summary }) : (response.result ?? []);
    return {
      content: [
        { type: "text" as const, text: Array.isArray(response.result) ? `Found ${shaped.length} bills:` : `Count: ${response.result}` },
        ...(Array.isArray(response.result)
          ? shaped.map((b: any) => ({ type: "text" as const, text: JSON.stringify(b) }))
          : []),
      ],
    };
  },
}; 