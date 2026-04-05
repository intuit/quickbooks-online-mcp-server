// src/tools/execute-action.tool.ts
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ACTION_CATALOG } from "../catalog/action-catalog.js";
import { ENTITIES } from "../catalog/entity-config.js";
import {
  executeCreate,
  executeGet,
  executeUpdate,
  executeDelete,
  executeSearch,
} from "../handlers/generic-handler.js";
import { formatError } from "../helpers/format-error.js";

const inputSchema = {
  action_id: z
    .string()
    .describe(
      "The action ID from search_actions results (e.g. 'create_customer', 'search_invoices').",
    ),
  params: z
    .record(z.string(), z.any())
    .describe(
      "Parameters for the action. Shape depends on the operation type — check parameterHints from search_actions.",
    ),
};

export function registerExecuteAction(server: McpServer) {
  server.registerTool(
    "execute_action",
    {
      description:
        "Execute a QuickBooks action by its ID. Get the action_id and required params from search_actions first. For create/update: pass { data: {...} }. For get/delete: pass { id: 'the-id' }. For search: pass { criteria: [...], limit?, offset? }.",
      inputSchema,
      annotations: { openWorldHint: true },
    },
    async ({ action_id, params }) => {
      const action = ACTION_CATALOG.find((a) => a.id === action_id);
      if (!action) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `Unknown action "${action_id}". Use search_actions to find valid action IDs.`,
            },
          ],
        };
      }

      const config = ENTITIES[action.entity];
      if (!config) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `Entity "${action.entity}" not configured. This is a server bug.`,
            },
          ],
        };
      }

      const label = config.label;
      const op = action.operation;

      try {
        let result: any;

        switch (op) {
          case "create":
            result = await executeCreate(action.entity, params.data);
            return {
              content: [
                {
                  type: "text" as const,
                  text: `${label} created successfully (ID: ${result?.Id ?? "unknown"}):`,
                },
                { type: "text" as const, text: JSON.stringify(result, null, 2) },
              ],
            };

          case "get":
            result = await executeGet(action.entity, params.id);
            return {
              content: [
                { type: "text" as const, text: `${label} (ID: ${params.id}):` },
                { type: "text" as const, text: JSON.stringify(result, null, 2) },
              ],
            };

          case "update":
            result = await executeUpdate(action.entity, params.data);
            return {
              content: [
                {
                  type: "text" as const,
                  text: `${label} updated successfully (ID: ${result?.Id ?? params.data?.Id ?? "unknown"}):`,
                },
                { type: "text" as const, text: JSON.stringify(result, null, 2) },
              ],
            };

          case "delete": {
            const deleteId = params.id ?? params.data;
            result = await executeDelete(action.entity, deleteId);
            const verb = config.softDelete ? "deactivated" : "deleted";
            return {
              content: [
                { type: "text" as const, text: `${label} ${verb} successfully.` },
                { type: "text" as const, text: JSON.stringify(result, null, 2) },
              ],
            };
          }

          case "search": {
            const items = await executeSearch(action.entity, params.criteria ?? params);
            const count = items.length;
            const truncated = items.slice(0, 50);
            const suffix = count > 50 ? ` Showing first 50 of ${count}. Refine your search criteria to narrow down.` : "";
            return {
              content: [
                { type: "text" as const, text: `Found ${count} ${label.toLowerCase()}(s).${suffix}` },
                { type: "text" as const, text: JSON.stringify(truncated, null, 2) },
              ],
            };
          }

          default:
            return {
              isError: true,
              content: [
                {
                  type: "text" as const,
                  text: `Unknown operation "${op}" for action "${action_id}".`,
                },
              ],
            };
        }
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `Error executing ${action_id}: ${formatError(error)}. Use search_actions to verify the action exists and check the parameterHints for correct parameter format.`,
            },
          ],
        };
      }
    },
  );
}
