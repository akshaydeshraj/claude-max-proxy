import type { OpenAIChatRequest, OpenAIMessage } from "../types/openai.js";
import { mapModel, mapEffort } from "./model-map.js";
import { config } from "../config.js";

export interface SDKQueryParams {
  prompt: string;
  model: string;
  systemPrompt?: string;
  effort?: "low" | "medium" | "high";
  stream: boolean;
  includeUsageInStream: boolean;
  conversationId?: string | null;
  messageCount: number;
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

export function hasImageContent(messages: OpenAIMessage[]): boolean {
  return messages.some((m) => {
    if (typeof m.content === "string" || m.content === null) return false;
    return m.content.some((part) => part.type === "image_url");
  });
}

export function convertRequest(req: OpenAIChatRequest): SDKQueryParams {
  const model = mapModel(req.model);
  const systemPrompt = extractSystemPrompt(req.messages);
  const prompt = extractLastUserMessage(req.messages);
  const effort = mapEffort(req.reasoning_effort);
  const stream = req.stream ?? false;
  const includeUsageInStream = req.stream_options?.include_usage ?? false;

  return {
    prompt,
    model,
    systemPrompt,
    effort,
    stream,
    includeUsageInStream,
    messageCount: req.messages.length,
  };
}

export function validateRequest(req: OpenAIChatRequest): string | null {
  if (!req.messages || !Array.isArray(req.messages) || req.messages.length === 0) {
    return "messages is required and must be a non-empty array";
  }

  if (!req.model) {
    return "model is required";
  }

  if (req.n !== undefined && req.n > 1) {
    return "n > 1 is not supported";
  }

  if (
    req.tool_choice &&
    typeof req.tool_choice === "string" &&
    req.tool_choice === "required"
  ) {
    return "tool use is not supported by this proxy";
  }

  return null;
}
