import { updateQuickbooksDeposit } from "../handlers/update-quickbooks-deposit.handler.js";
import { ToolDefinition } from "../types/tool-definition.js";
import { z } from "zod";

const toolName = "update_deposit";
const toolDescription =
  "Update a deposit in QuickBooks Online: set its private note and/or re-categorize its lines. " +
  "Use `lines` to change the account (and optionally the description) a deposit line is booked to; " +
  "get the line Ids from get_deposit. Line amounts, the deposit-to bank account, the date and every " +
  "other field are sent back unchanged, so the deposit still ties to the bank feed " +
  "(amounts cannot be changed by this tool). At least one of private_note or lines is required.";

const lineSchema = z
  .object({
    line_id: z.string().min(1).describe("Id of the existing deposit line to change (Line[].Id from get_deposit)"),
    account_ref: z.string().min(1).optional().describe("Account ID to book this line to, e.g. an Other Income account"),
    description: z.string().optional().describe("New description for this line"),
  })
  .refine((line) => line.account_ref !== undefined || line.description !== undefined, {
    message: "Each line needs account_ref or description",
  });

const toolSchema = z.object({
  id: z.string().min(1).describe("Deposit ID"),
  sync_token: z.string().min(1).describe("Sync token"),
  private_note: z.string().optional().describe("Private note"),
  lines: z
    .array(lineSchema)
    .optional()
    .describe(
      "Line re-categorizations: each entry targets an existing line by line_id and sets its account_ref " +
        "and/or description; amounts cannot be changed by this tool. line_ids must be unique."
    ),
});

const toolHandler = async ({ params }: any) => {
  const response = await updateQuickbooksDeposit(params);
  if (response.isError) return { content: [{ type: "text" as const, text: `Error: ${response.error}` }] };
  return { content: [{ type: "text" as const, text: `Deposit updated:` }, { type: "text" as const, text: JSON.stringify(response.result, null, 2) }] };
};

export const UpdateDepositTool: ToolDefinition<typeof toolSchema> = { name: toolName, description: toolDescription, schema: toolSchema, handler: toolHandler };
