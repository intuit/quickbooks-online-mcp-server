import { getQuickbooksCompanyInfo } from "../handlers/get-quickbooks-company-info.handler.js";
import { ToolDefinition } from "../types/tool-definition.js";
import { z } from "zod";

const toolName = "get_company_info";
const toolDescription =
  "Get company information from QuickBooks Online for auth validation.";

const toolSchema = z.object({});

const toolHandler = async (_args: any) => {
  const response = await getQuickbooksCompanyInfo();

  if (response.isError) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Error getting company info: ${response.error}`,
        },
      ],
    };
  }

  return {
    content: [
      { type: "text" as const, text: JSON.stringify(response.result) },
    ],
  };
};

export const GetCompanyInfoTool: ToolDefinition<typeof toolSchema> = {
  name: toolName,
  description: toolDescription,
  schema: toolSchema,
  handler: toolHandler,
};
