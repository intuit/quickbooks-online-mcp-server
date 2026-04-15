import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function createMcpServer(): McpServer {
  return new McpServer(
    { name: "QuickBooks Online MCP Server", version: "1.0.0" },
    { capabilities: { tools: {} } },
  );
}

export class QuickbooksMCPServer {
  private static instance: McpServer | null = null;

  private constructor() {}

  public static GetServer(): McpServer {
    if (QuickbooksMCPServer.instance === null) {
      QuickbooksMCPServer.instance = createMcpServer();
    }
    return QuickbooksMCPServer.instance;
  }
}