import { getQuickbooksTransactionList } from "../handlers/get-quickbooks-transaction-list.handler.js";
import { ToolDefinition } from "../types/tool-definition.js";
import { z } from "zod";

const toolName = "get_transaction_list";
const toolDescription =
  "Generate a Transaction List report from QuickBooks Online: one row per transaction (or per line) " +
  "across all transaction types (Invoice, Bill, Expense, Payment, SalesReceipt, Deposit, JournalEntry, " +
  "VendorCredit, ...). Supports server-side filtering by vendor and customer — filters the entity query " +
  "language does not support (e.g. Purchase.EntityRef is not queryable). Each row's Transaction Type cell " +
  "includes the transaction Id, which can be used with the get_* entity tools (e.g. get_purchase) to fetch " +
  "the full object. start_date is required (QBO otherwise defaults the report to this month-to-date and " +
  "silently omits earlier transactions); pass 1900-01-01 to cover the full history.";
const toolSchema = z.object({
  start_date: z.string().describe("Start date (YYYY-MM-DD), required. Pass 1900-01-01 to cover the full history."),
  end_date: z.string().optional().describe("End date (YYYY-MM-DD). Defaults to today."),
  vendor: z.string().optional().describe("Filter by vendor ID(s), comma separated (find IDs with search_vendors)"),
  customer: z.string().optional().describe("Filter by customer ID(s), comma separated (find IDs with search_customers)"),
  group_by: z
    .string()
    .optional()
    .describe("Group results by: Name, Account, Transaction Type, Customer, Vendor, Employee, Location, Payment Method, Day, Week, Month, Quarter, Year, Fiscal Year, Fiscal Quarter, or None"),
  transaction_type: z.string().optional().describe("Only include these transaction types, comma separated (e.g. 'Bill,Check'). Note: 'Expense' and 'Purchase' are not accepted by the QBO report API (400 Invalid Enumeration)"),
});

const toolHandler = async ({ params }: any) => {
  const response = await getQuickbooksTransactionList(params);
  if (response.isError) return { content: [{ type: "text" as const, text: `Error: ${response.error}` }] };
  return { content: [{ type: "text" as const, text: `Transaction List Report:` }, { type: "text" as const, text: JSON.stringify(response.result, null, 2) }] };
};

export const GetTransactionListTool: ToolDefinition<typeof toolSchema> = { name: toolName, description: toolDescription, schema: toolSchema, handler: toolHandler };
