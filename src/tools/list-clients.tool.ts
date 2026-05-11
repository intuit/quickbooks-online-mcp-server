import { ToolDefinition } from "../types/tool-definition.js";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";

const toolName = "list_clients";
const toolDescription =
  "List all available QuickBooks Online client accounts. Shows which client is currently active.";

const toolSchema = z.object({});

const toolHandler = async () => {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
  const currentClient = process.env.QBO_CLIENT_NAME || "unknown";

  if (!supabaseUrl || !supabaseKey) {
    return {
      content: [{ type: "text" as const, text: "Supabase not configured — cannot list clients." }],
    };
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const { data, error } = await supabase
    .from("qbo_clients")
    .select("slug, name, realm_id, added_at")
    .order("name");

  if (error) {
    return {
      content: [{ type: "text" as const, text: `Error listing clients: ${error.message}` }],
    };
  }

  const lines = (data || []).map(
    (c) =>
      `${c.slug === currentClient ? "→ " : "  "}${c.slug}  —  ${c.name}  (realm: ${c.realm_id}, added: ${c.added_at})`
  );

  return {
    content: [
      {
        type: "text" as const,
        text: `Available QBO clients (${data?.length || 0}):\n\n${lines.join("\n")}\n\nCurrent: ${currentClient}`,
      },
    ],
  };
};

export const ListClientsTool: ToolDefinition<typeof toolSchema> = {
  name: toolName,
  description: toolDescription,
  schema: toolSchema,
  handler: toolHandler as any,
};
