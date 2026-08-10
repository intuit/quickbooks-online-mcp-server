import { QuickbooksClient } from "../clients/quickbooks-client.js";
import { ToolResponse } from "../types/tool-response.js";
import { formatError } from "../helpers/format-error.js";

export interface SearchAttachablesInput {
  file_name?: string;
  file_name_like?: string;
  content_type?: string;
  created_after?: string;
  created_before?: string;
  limit?: number;
  offset?: number;
  orderby?: string;
}

/**
 * Search attachables with pagination, ordering (default: newest first — the
 * QBO default of oldest-first made "does txn X have a recent attachment"
 * impossible on large files), and created-date range filters.
 */
export async function searchQuickbooksAttachables(data: SearchAttachablesInput): Promise<ToolResponse<any>> {
  try {
    const quickbooks = await QuickbooksClient.getInstance();
    const criteria: Array<Record<string, any>> = [];
    if (data.file_name) criteria.push({ field: "FileName", value: data.file_name, operator: "=" });
    if (data.file_name_like)
      criteria.push({ field: "FileName", value: `%${data.file_name_like}%`, operator: "LIKE" });
    if (data.content_type) criteria.push({ field: "ContentType", value: data.content_type, operator: "=" });
    if (data.created_after)
      criteria.push({ field: "MetaData.CreateTime", value: data.created_after, operator: ">=" });
    if (data.created_before)
      criteria.push({ field: "MetaData.CreateTime", value: data.created_before, operator: "<=" });
    if (data.limit) criteria.push({ field: "limit", value: data.limit });
    if (data.offset) criteria.push({ field: "offset", value: data.offset });

    // Ordering: default newest-first. node-quickbooks expects {field:'asc'|'desc', value:<field>}.
    const orderby = (data.orderby ?? "MetaData.CreateTime DESC").trim();
    const descending = / desc$/i.test(orderby);
    const orderField = orderby.replace(/ (asc|desc)$/i, "");
    criteria.push({ field: descending ? "desc" : "asc", value: orderField });

    return new Promise((resolve) => {
      (quickbooks as any).findAttachables(criteria, (err: any, result: any) => {
        if (err) resolve({ result: null, isError: true, error: formatError(err) });
        else resolve({ result: result?.QueryResponse?.Attachable || [], isError: false, error: null });
      });
    });
  } catch (error) {
    return { result: null, isError: true, error: formatError(error) };
  }
}

/**
 * Convenience: all attachables referencing a given entity (bill, purchase,
 * invoice, ...). AttachableRef is not queryable in QBO SQL, so this pages
 * through attachables newest-first and filters by AttachableRef server-side
 * before returning — the caller never sees the unfiltered dump.
 */
export async function getQuickbooksEntityAttachments(data: {
  entity_type: string;
  entity_id: string;
  max_scan?: number;
}): Promise<ToolResponse<any>> {
  try {
    const quickbooks = await QuickbooksClient.getInstance();
    const targetType = data.entity_type.trim().toLowerCase().replace(/[\s_-]/g, "");
    const targetId = String(data.entity_id);
    const pageSize = 1000;
    const maxScan = data.max_scan ?? 5000;
    const matches: any[] = [];
    let scanned = 0;

    for (let offset = 1; scanned < maxScan; offset += pageSize) {
      const page: any[] = await new Promise((resolve, reject) => {
        (quickbooks as any).findAttachables(
          [
            { field: "desc", value: "MetaData.CreateTime" },
            { field: "limit", value: pageSize },
            { field: "offset", value: offset },
          ],
          (err: any, result: any) =>
            err ? reject(err) : resolve(result?.QueryResponse?.Attachable || [])
        );
      });
      scanned += page.length;
      for (const att of page) {
        const refs: any[] = att?.AttachableRef ?? [];
        const hit = refs.some(
          (r) =>
            String(r?.EntityRef?.value ?? "") === targetId &&
            String(r?.EntityRef?.type ?? "").toLowerCase().replace(/[\s_-]/g, "") === targetType
        );
        if (hit) matches.push(att);
      }
      if (page.length < pageSize) break; // last page
    }

    return { result: { matches, scanned, complete: scanned < maxScan }, isError: false, error: null };
  } catch (error) {
    return { result: null, isError: true, error: formatError(error) };
  }
}
