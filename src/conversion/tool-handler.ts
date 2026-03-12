import { z } from "zod";
import {
  createSdkMcpServer,
  type SdkMcpToolDefinition,
} from "@anthropic-ai/claude-agent-sdk";
import type { OpenAITool, OpenAIToolCall } from "../types/openai.js";
import { v4 as uuidv4 } from "uuid";

/**
 * Convert a JSON Schema property to a Zod type.
 * Handles common cases; falls back to z.any() for unsupported types.
 */
export function jsonSchemaPropertyToZod(prop: Record<string, unknown>): z.ZodTypeAny {
  if (!prop) return z.any();

  if (prop.enum && Array.isArray(prop.enum)) {
    const values = prop.enum as [string, ...string[]];
    if (values.length > 0 && values.every((v) => typeof v === "string")) {
      return z.enum(values);
    }
    return z.any();
  }

  switch (prop.type) {
    case "string":
      return z.string();
    case "number":
      return z.number();
    case "integer":
      return z.number().int();
    case "boolean":
      return z.boolean();
    case "array":
      return z.array(
        prop.items ? jsonSchemaPropertyToZod(prop.items as Record<string, unknown>) : z.any(),
      );
    case "object":
      return z.object(jsonSchemaToZodShape(prop));
    case "null":
      return z.null();
    default:
      return z.any();
  }
}

/**
 * Convert a JSON Schema object's properties into a Zod raw shape.
 */
export function jsonSchemaToZodShape(
  schema: Record<string, unknown>,
): Record<string, z.ZodTypeAny> {
  const properties = (schema?.properties ?? {}) as Record<string, Record<string, unknown>>;
  const required = new Set(
    Array.isArray(schema?.required) ? (schema.required as string[]) : [],
  );
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const [key, prop] of Object.entries(properties)) {
    let zodType = jsonSchemaPropertyToZod(prop);
    if (!required.has(key)) {
      zodType = zodType.optional();
    }
    shape[key] = zodType;
  }

  return shape;
}

export interface ToolCallCapture {
  toolCalls: OpenAIToolCall[];
  textContent: string;
}

/**
 * Create an MCP server config from OpenAI tool definitions.
 * The handlers capture tool calls into the provided capture object
 * and return a placeholder result. The SDK continues to completion,
 * but we detect the captured tool calls and return them to the client.
 */
export function createToolMcpServer(
  tools: OpenAITool[],
  capture: ToolCallCapture,
) {
  const mcpTools: SdkMcpToolDefinition[] = tools.map((tool) => {
    const params = tool.function.parameters ?? {};
    const zodShape = jsonSchemaToZodShape(params as Record<string, unknown>);

    return {
      name: tool.function.name,
      description: tool.function.description ?? "",
      inputSchema: zodShape,
      handler: async (args: Record<string, unknown>) => {
        capture.toolCalls.push({
          id: `call_${uuidv4()}`,
          type: "function",
          function: {
            name: tool.function.name,
            arguments: JSON.stringify(args),
          },
        });

        // Return a placeholder — the SDK feeds this back to the model,
        // but we'll discard the model's response and return tool_calls to the client
        return { content: [{ type: "text" as const, text: "[Tool call captured - awaiting client execution]" }] };
      },
    } as SdkMcpToolDefinition;
  });

  return createSdkMcpServer({
    name: "openai-tools",
    version: "1.0.0",
    tools: mcpTools,
  });
}

/**
 * Build a system prompt section describing tools for multi-turn
 * conversations that include tool results.
 */
export function buildToolResultContext(
  tools: OpenAITool[],
  messages: Array<{
    role: string;
    content: string | unknown[] | null;
    tool_calls?: OpenAIToolCall[];
    tool_call_id?: string;
  }>,
): string {
  const parts: string[] = [];

  // Describe available tools
  parts.push("You have access to the following tools:");
  for (const tool of tools) {
    parts.push(`\nTool: ${tool.function.name}`);
    if (tool.function.description) {
      parts.push(`Description: ${tool.function.description}`);
    }
    if (tool.function.parameters) {
      parts.push(`Parameters: ${JSON.stringify(tool.function.parameters)}`);
    }
  }

  // Include conversation history with tool calls and results
  parts.push("\n\nConversation history:");
  for (const msg of messages) {
    if (msg.role === "assistant" && msg.tool_calls) {
      parts.push(`\nAssistant called tools:`);
      for (const tc of msg.tool_calls) {
        parts.push(`  ${tc.function.name}(${tc.function.arguments})`);
      }
      if (msg.content) {
        parts.push(`Assistant said: ${msg.content}`);
      }
    } else if (msg.role === "tool") {
      parts.push(`\nTool result (${msg.tool_call_id}): ${msg.content}`);
    }
  }

  return parts.join("\n");
}

/**
 * Check if a message array contains tool result messages,
 * indicating a multi-turn tool calling conversation.
 */
export function hasToolResultMessages(
  messages: Array<{ role: string }>,
): boolean {
  return messages.some((m) => m.role === "tool");
}
