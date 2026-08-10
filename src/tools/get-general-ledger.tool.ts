import { getQuickbooksGeneralLedger } from "../handlers/get-quickbooks-general-ledger.handler.js";
import { ToolDefinition } from "../types/tool-definition.js";
import { z } from "zod";

const toolName = "get_general_ledger";
const toolDescription = "Generate a General Ledger report from QuickBooks Online showing detailed transaction history.";
const toolSchema = z.object({
  start_date: z.string().optional().describe("Start date (YYYY-MM-DD)"),
  end_date: z.string().optional().describe("End date (YYYY-MM-DD)"),
  accounting_method: z.enum(["Cash", "Accrual"]).optional().describe("Accounting method"),
  account: z.string().optional().describe("Filter by account ID (comma-separate for multiple)"),
  source_account: z.string().optional().describe("Filter by source account"),
  sort_by: z.string().optional().describe("Field to sort by"),
  summary: z
    .boolean()
    .optional()
    .describe("Return compact flattened rows ({column: value} per transaction line) instead of QBO's raw nested report — a fraction of the size"),
  fields: z
    .array(z.string())
    .optional()
    .describe("With summary, keep only these columns (by column title, e.g. ['Date','Amount','Balance'])"),
});

const toolHandler = async ({ params }: any) => {
  const response = await getQuickbooksGeneralLedger(params);
  if (response.isError) return { content: [{ type: "text" as const, text: `Error: ${response.error}` }] };
  return { content: [{ type: "text" as const, text: `General Ledger Report:` }, { type: "text" as const, text: JSON.stringify(response.result, null, 2) }] };
};

export const GetGeneralLedgerTool: ToolDefinition<typeof toolSchema> = { name: toolName, description: toolDescription, schema: toolSchema, handler: toolHandler };
