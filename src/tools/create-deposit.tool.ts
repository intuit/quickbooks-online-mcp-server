import { createQuickbooksDeposit } from "../handlers/create-quickbooks-deposit.handler.js";
import { ToolDefinition } from "../types/tool-definition.js";
import { z } from "zod";

const toolName = "create_deposit";
const toolDescription = "Create a bank deposit in QuickBooks Online.";

const lineItemSchema = z.object({
  amount: z.number().positive(),
  account_ref: z.string().optional(),
  description: z.string().optional(),
  tax_code_ref: z.string().optional().describe("Tax code ID for the line"),
});

const toolSchema = z.object({
  deposit_to_account_ref: z.string().min(1).describe("Bank account ID to deposit to"),
  line_items: z.array(lineItemSchema).min(1).describe("Deposit line items"),
  txn_date: z.string().optional().describe("Transaction date (YYYY-MM-DD)"),
  private_note: z.string().optional().describe("Private note"),
  currency_ref: z.string().optional().describe("Currency code (e.g. USD), required when the bank account is not in the home currency"),
  exchange_rate: z.number().positive().optional().describe("Home-currency units per one unit of currency_ref"),
});

const toolHandler = async ({ params }: any) => {
  const response = await createQuickbooksDeposit(params);
  if (response.isError) return { content: [{ type: "text" as const, text: `Error: ${response.error}` }] };
  return { content: [{ type: "text" as const, text: `Deposit created:` }, { type: "text" as const, text: JSON.stringify(response.result, null, 2) }] };
};

export const CreateDepositTool: ToolDefinition<typeof toolSchema> = { name: toolName, description: toolDescription, schema: toolSchema, handler: toolHandler };
