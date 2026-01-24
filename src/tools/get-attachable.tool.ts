import { getQuickbooksAttachable } from "../handlers/get-quickbooks-attachable.handler.js";
import { ToolDefinition } from "../types/tool-definition.js";
import { z } from "zod";

const toolName = "get_attachable";
const toolDescription = "Get an attachable (file attachment) by Id from QuickBooks Online. Returns metadata including TempDownloadUri for downloading the file.";

const toolSchema = z.object({
  id: z.string(),
});

const toolHandler = async (args: any) => {
  const id = args.params?.id || args.id;
  const response = await getQuickbooksAttachable(id);

  if (response.isError) {
    return {
      content: [
        { type: "text" as const, text: `Error getting attachable: ${response.error}` },
      ],
    };
  }

  return {
    content: [
      { type: "text" as const, text: `Attachable retrieved: ${JSON.stringify(response.result)}` },
    ],
  };
};

export const GetAttachableTool: ToolDefinition<typeof toolSchema> = {
  name: toolName,
  description: toolDescription,
  schema: toolSchema,
  handler: toolHandler,
};
