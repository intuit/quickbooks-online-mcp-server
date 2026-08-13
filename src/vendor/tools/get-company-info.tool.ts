import { getQuickbooksCompanyInfo } from "../handlers/get-quickbooks-company-info.handler.js";
import { ToolDefinition } from "../types/tool-definition.js";
import { z } from "zod";

const toolName = "get_company_info";
const toolDescription = "Retrieve the company information from QuickBooks Online.";
const toolSchema = z.object({
  company_id: z.string().optional().describe("Company ID (uses connected company if not specified)"),
});

const toolHandler = async ({ params }: any) => {
  const response = await getQuickbooksCompanyInfo(params.company_id);
  if (response.isError) return { content: [{ type: "text" as const, text: `Error: ${response.error}` }] };
  return { content: [{ type: "text" as const, text: JSON.stringify(response.result, null, 2) }] };
};

export const GetCompanyInfoTool: ToolDefinition<typeof toolSchema> = { name: toolName, description: toolDescription, schema: toolSchema, handler: toolHandler };
