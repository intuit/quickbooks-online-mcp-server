import { ToolDefinition } from "../types/tool-definition.js";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { quickbooksClient } from "../clients/quickbooks-client.js";

const toolName = "switch_client";
const toolDescription =
  "Switch to a different QuickBooks Online client account. Use list_clients first to see available options.";

const toolSchema = z.object({
  slug: z.string().describe("The client slug to switch to (e.g. 'potluck-club')"),
});

const toolHandler = async (args: any) => {
  const { slug } = (args.params ?? {}) as z.infer<typeof toolSchema>;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return {
      content: [{ type: "text" as const, text: "Supabase not configured — cannot switch clients." }],
    };
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const { data, error } = await supabase
    .from("qbo_clients")
    .select("slug, name, realm_id, refresh_token")
    .eq("slug", slug)
    .single();

  if (error || !data) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Client "${slug}" not found. Use list_clients to see available options.`,
        },
      ],
    };
  }

  quickbooksClient.reconfigure(data.refresh_token, data.realm_id);
  process.env.QUICKBOOKS_REFRESH_TOKEN = data.refresh_token;
  process.env.QUICKBOOKS_REALM_ID = data.realm_id;
  process.env.QBO_CLIENT_NAME = data.slug;

  try {
    await quickbooksClient.authenticate();
  } catch (authErr: any) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Switched to "${data.name}" but authentication failed: ${authErr.message}. The refresh token may need to be renewed.`,
        },
      ],
    };
  }

  return {
    content: [
      {
        type: "text" as const,
        text: `Switched to "${data.name}" (realm: ${data.realm_id}). All subsequent QBO operations will use this account.`,
      },
    ],
  };
};

export const SwitchClientTool: ToolDefinition<typeof toolSchema> = {
  name: toolName,
  description: toolDescription,
  schema: toolSchema,
  handler: toolHandler as any,
};
