import { getQuickbooks } from "../clients/quickbooks-client.js";
import { ToolResponse } from "../types/tool-response.js";
import { formatError } from "../helpers/format-error.js";

export interface CreateAttachableInput {
  file_name: string;
  note?: string;
  category?: string;
  content_type?: string;
  attachable_ref?: {
    entity_ref_type: string;
    entity_ref_value: string;
  };
}

export async function createQuickbooksAttachable(data: CreateAttachableInput): Promise<ToolResponse<any>> {
  try {
    const quickbooks = await getQuickbooks();
    const payload: any = { FileName: data.file_name };
    if (data.note) payload.Note = data.note;
    if (data.category) payload.Category = data.category;
    if (data.content_type) payload.ContentType = data.content_type;
    if (data.attachable_ref) {
      payload.AttachableRef = [{
        EntityRef: {
          type: data.attachable_ref.entity_ref_type,
          value: data.attachable_ref.entity_ref_value
        }
      }];
    }

    return new Promise((resolve) => {
      (quickbooks as any).createAttachable(payload, (err: any, created: any) => {
        if (err) resolve({ result: null, isError: true, error: formatError(err) });
        else resolve({ result: created, isError: false, error: null });
      });
    });
  } catch (error) {
    return { result: null, isError: true, error: formatError(error) };
  }
}
