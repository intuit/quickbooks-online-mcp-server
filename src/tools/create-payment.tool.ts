import { createQuickbooksPayment } from "../handlers/create-quickbooks-payment.handler.js";
import { ToolDefinition } from "../types/tool-definition.js";
import { z } from "zod";

const toolName = "create_payment";
const toolDescription = "Create a payment (receive money from customer) in QuickBooks Online.";

const linkedTxnSchema = z.object({
  txn_id: z.string().describe("Transaction ID to apply payment to"),
  txn_type: z.string().describe("Transaction type (e.g., Invoice)"),
});

const lineSchema = z.object({
  amount: z.number().describe("Amount to apply to this transaction"),
  linked_txn: z.array(linkedTxnSchema).describe("Linked transactions"),
});

const toolSchema = z.object({
  customer_ref: z.string().min(1).describe("Customer ID"),
  total_amt: z.number().positive().describe("Total payment amount"),
  payment_method_ref: z.string().optional().describe("Payment method ID"),
  deposit_to_account_ref: z.string().optional().describe("Account to deposit to"),
  txn_date: z.string().optional().describe("Transaction date (YYYY-MM-DD)"),
  private_note: z.string().optional().describe("Private note"),
  payment_ref_num: z.string().optional().describe("Reference no. for the payment, e.g. a bank transfer/transaction number (PaymentRefNum)"),
  currency_ref: z.string().optional().describe("Reference to the currency (e.g. USD, GBP) in which all amounts on the payment are expressed. Required if multicurrency is enabled for the company (CurrencyRef)"),
  exchange_rate: z.number().positive().optional().describe("The number of home-currency units it takes to equal one unit of the currency specified by currency_ref. Applicable if multicurrency is enabled for the company (ExchangeRate)"),
  line: z.array(lineSchema).optional().describe("Line items linking to invoices"),
});

const toolHandler = async ({ params }: any) => {
  const response = await createQuickbooksPayment(params);
  if (response.isError) {
    return { content: [{ type: "text" as const, text: `Error creating payment: ${response.error}` }] };
  }
  return {
    content: [
      { type: "text" as const, text: `Payment created successfully:` },
      { type: "text" as const, text: JSON.stringify(response.result, null, 2) },
    ],
  };
};

export const CreatePaymentTool: ToolDefinition<typeof toolSchema> = {
  name: toolName,
  description: toolDescription,
  schema: toolSchema,
  handler: toolHandler,
};
