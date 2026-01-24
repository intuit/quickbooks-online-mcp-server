import { uploadQuickbooksAttachable } from "../handlers/upload-quickbooks-attachable.handler.js";
import { ToolDefinition } from "../types/tool-definition.js";
import { z } from "zod";

const toolName = "upload_attachable";
const toolDescription = "Upload a local file as an attachable to QuickBooks Online. Can optionally link it to a specific entity (Bill, Purchase, Invoice, etc.).";

const toolSchema = z.object({
  filePath: z.string().describe("Local path to the file to upload"),
  entityType: z.string().optional().describe("Entity type to link to: 'Bill', 'Purchase', 'Invoice', 'Vendor', 'Customer', etc."),
  entityId: z.string().optional().describe("Entity ID to link the attachment to"),
});

const toolHandler = async (args: any) => {
  const response = await uploadQuickbooksAttachable(
    args.params.filePath,
    args.params.entityType,
    args.params.entityId
  );

  if (response.isError) {
    return {
      content: [
        { type: "text" as const, text: `Error uploading attachable: ${response.error}` },
      ],
    };
  }

  const att = response.result;
  return {
    content: [
      {
        type: "text" as const,
        text: `Uploaded successfully!\nAttachable ID: ${att.Id}\nFilename: ${att.FileName}${att.AttachableRef ? `\nLinked to: ${att.AttachableRef[0]?.EntityRef?.type} ${att.AttachableRef[0]?.EntityRef?.value}` : ""}`,
      },
    ],
  };
};

export const UploadAttachableTool: ToolDefinition<typeof toolSchema> = {
  name: toolName,
  description: toolDescription,
  schema: toolSchema,
  handler: toolHandler,
};
