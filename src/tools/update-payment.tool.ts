import { updateQuickbooksPayment } from "../handlers/update-quickbooks-payment.handler.js";
import { ToolDefinition } from "../types/tool-definition.js";
import { z } from "zod";

const toolName = "update_payment";
const toolDescription =
  "Update an existing payment in QuickBooks Online. Supports applying the payment to transactions via `line` (e.g. settling an unapplied payment against an invoice), mirroring create_payment. NOTE: `line` REPLACES the payment's existing applications rather than adding to them — QBO treats Payment.Line as the authoritative set. To keep current applications, read them with get_payment first and send them back alongside the new one; omit `line` entirely to leave applications untouched.";

const linkedTxnSchema = z.object({
  txn_id: z.string().describe("Transaction ID to apply the payment to"),
  txn_type: z.string().describe("Transaction type (e.g., Invoice)"),
});

const lineSchema = z.object({
  amount: z.number().describe("Amount to apply to this transaction"),
  linked_txn: z.array(linkedTxnSchema).describe("Linked transactions"),
});

const toolSchema = z.object({
  id: z.string().min(1).describe("Payment ID"),
  sync_token: z.string().min(1).describe("Sync token for optimistic locking"),
  customer_ref: z.string().optional().describe("Customer ID"),
  total_amt: z.number().optional().describe("Total payment amount"),
  payment_method_ref: z.string().optional().describe("Payment method ID"),
  private_note: z.string().optional().describe("Private note"),
  deposit_to_account_ref: z
    .string()
    .optional()
    .describe("Account ID the payment is deposited to (Payment.DepositToAccountRef)"),
  line: z
    .array(lineSchema)
    .optional()
    .describe(
      "Line items applying this payment to transactions (Payment.Line[].LinkedTxn). REPLACES all existing applications — include any you want to keep. Omit to leave the payment's current applications unchanged."
    ),
});

const toolHandler = async ({ params }: any) => {
  const response = await updateQuickbooksPayment(params);
  if (response.isError) {
    return { content: [{ type: "text" as const, text: `Error updating payment: ${response.error}` }] };
  }
  return {
    content: [
      { type: "text" as const, text: `Payment updated successfully:` },
      { type: "text" as const, text: JSON.stringify(response.result, null, 2) },
    ],
  };
};

export const UpdatePaymentTool: ToolDefinition<typeof toolSchema> = {
  name: toolName,
  description: toolDescription,
  schema: toolSchema,
  handler: toolHandler,
};
