import { downloadQuickbooksAttachable } from "../handlers/download-quickbooks-attachable.handler.js";
import { ToolDefinition } from "../types/tool-definition.js";
import { z } from "zod";

const toolName = "download_attachable";
const toolDescription = "Download an attachable (file attachment) from QuickBooks Online to local filesystem. Returns the local file path which can then be read/parsed.";

const toolSchema = z.object({
  id: z.string().describe("The QuickBooks attachable ID"),
  outputPath: z.string().optional().describe("Optional path to save the file (defaults to temp directory)"),
});

const toolHandler = async (args: any) => {
  const response = await downloadQuickbooksAttachable(
    args.params.id,
    args.params.outputPath
  );

  if (response.isError) {
    return {
      content: [
        { type: "text" as const, text: `Error downloading attachable: ${response.error}` },
      ],
    };
  }

  return {
    content: [
      {
        type: "text" as const,
        text: `Downloaded "${response.result!.fileName}" to: ${response.result!.filePath}`,
      },
    ],
  };
};

export const DownloadAttachableTool: ToolDefinition<typeof toolSchema> = {
  name: toolName,
  description: toolDescription,
  schema: toolSchema,
  handler: toolHandler,
};
