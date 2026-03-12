import type { OpenAIChatRequest, OpenAIMessage, OpenAITool } from "../types/openai.js";
import { mapEffort } from "./model-map.js";
import { convertContentParts, type AnthropicContentBlock } from "./image-handler.js";
import { hasToolResultMessages, buildToolResultContext } from "./tool-handler.js";

export interface SDKQueryParams {
  prompt: string;
  /** When images are present, content blocks for the SDK (text + image). */
  promptContentBlocks?: AnthropicContentBlock[];
  model: string;
  systemPrompt?: string;
  effort?: "low" | "medium" | "high";
  stream: boolean;
  includeUsageInStream: boolean;
  conversationId?: string | null;
  messageCount: number;
  /** OpenAI tool definitions, passed through for MCP server creation. */
  tools?: OpenAITool[];
}

export function extractTextFromContent(
  content: OpenAIMessage["content"],
): string {
  if (content === null) return "";
  if (typeof content === "string") return content;

  return content
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n");
}

export function extractSystemPrompt(
  messages: OpenAIMessage[],
): string | undefined {
  const systemMessages = messages.filter(
    (m) => m.role === "system" || m.role === "developer",
  );
  if (systemMessages.length === 0) return undefined;

  return systemMessages.map((m) => extractTextFromContent(m.content)).join("\n\n");
}

export function extractLastUserMessage(messages: OpenAIMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") {
      return extractTextFromContent(messages[i].content);
    }
  }
  return "";
}

/**
 * Extract the last user message's content parts (for image support).
 * Returns undefined if the last user message is a plain string.
 */
export function extractLastUserContentBlocks(
  messages: OpenAIMessage[],
): AnthropicContentBlock[] | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role === "user") {
      if (typeof msg.content === "string" || msg.content === null) {
        return undefined;
      }
      // Only return blocks if there are images
      const hasImages = msg.content.some((p) => p.type === "image_url");
      if (!hasImages) return undefined;
      return convertContentParts(msg.content);
    }
  }
  return undefined;
}

export function hasImageContent(messages: OpenAIMessage[]): boolean {
  return messages.some((m) => {
    if (typeof m.content === "string" || m.content === null) return false;
    return m.content.some((part) => part.type === "image_url");
  });
}

export function convertRequest(req: OpenAIChatRequest): SDKQueryParams {
  const model = req.model;
  let systemPrompt = extractSystemPrompt(req.messages);
  const prompt = extractLastUserMessage(req.messages);
  const promptContentBlocks = extractLastUserContentBlocks(req.messages);
  const effort = mapEffort(req.reasoning_effort);
  const stream = req.stream ?? false;
  const includeUsageInStream = req.stream_options?.include_usage ?? false;

  // Handle response_format by injecting into system prompt
  if (req.response_format) {
    const formatType = req.response_format.type;
    if (formatType === "json_object") {
      const jsonInstruction = "Respond with valid JSON only.";
      systemPrompt = systemPrompt
        ? `${systemPrompt}\n\n${jsonInstruction}`
        : jsonInstruction;
    } else if (formatType === "json_schema" && req.response_format.json_schema) {
      const schemaStr = JSON.stringify(req.response_format.json_schema);
      const jsonInstruction = `Respond with valid JSON only. Your response must conform to this JSON schema: ${schemaStr}`;
      systemPrompt = systemPrompt
        ? `${systemPrompt}\n\n${jsonInstruction}`
        : jsonInstruction;
    }
  }

  // Handle tool result messages by injecting context into system prompt
  const tools = req.tools && req.tools.length > 0 ? req.tools : undefined;
  if (tools && hasToolResultMessages(req.messages)) {
    const toolContext = buildToolResultContext(tools, req.messages);
    systemPrompt = systemPrompt
      ? `${systemPrompt}\n\n${toolContext}`
      : toolContext;
  }

  return {
    prompt,
    promptContentBlocks,
    model,
    systemPrompt,
    effort,
    stream,
    includeUsageInStream,
    messageCount: req.messages.length,
    tools,
  };
}

export function validateRequest(req: unknown): string | null {
  if (req === null || typeof req !== "object" || Array.isArray(req)) {
    return "Request body must be a JSON object";
  }
  const r = req as OpenAIChatRequest;
  if (!r.messages || !Array.isArray(r.messages) || r.messages.length === 0) {
    return "messages is required and must be a non-empty array";
  }

  if (!r.model) {
    return "model is required";
  }

  if (r.n !== undefined && r.n > 1) {
    return "n > 1 is not supported";
  }

  return null;
}
