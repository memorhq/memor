declare module "@modelcontextprotocol/sdk/server/mcp.js" {
  import { z } from "zod";

  export interface McpServerOptions {
    name: string;
    version: string;
  }

  export interface ToolDefinition {
    title?: string;
    description?: string;
    inputSchema?: Record<string, z.ZodType>;
    outputSchema?: Record<string, z.ZodType>;
  }

  export interface ToolResult {
    content: Array<{ type: "text"; text: string }>;
    isError?: boolean;
  }

  export class McpServer {
    constructor(options: McpServerOptions, config?: Record<string, unknown>);
    registerTool(
      name: string,
      definition: ToolDefinition,
      handler: (args: Record<string, unknown>) => Promise<ToolResult> | ToolResult
    ): void;
    registerResource(
      name: string,
      uri: string,
      definition: { title?: string; description?: string; mimeType?: string },
      handler: (uri: URL) => Promise<{ contents: Array<{ uri: string; text: string }> }>
    ): void;
    registerPrompt(
      name: string,
      definition: { title?: string; description?: string; argsSchema?: Record<string, z.ZodType> },
      handler: (args: Record<string, unknown>) => { messages: Array<{ role: string; content: { type: string; text: string } }> }
    ): void;
    connect(transport: unknown): Promise<void>;
  }
}

declare module "@modelcontextprotocol/sdk/server/stdio.js" {
  export class StdioServerTransport {
    constructor();
  }
}
