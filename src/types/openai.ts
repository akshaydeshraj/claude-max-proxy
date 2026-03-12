// OpenAI Chat Completions API types

export interface OpenAITextContent {
  type: "text";
  text: string;
}

export interface OpenAIImageContent {
  type: "image_url";
  image_url: {
    url: string;
    detail?: "low" | "high" | "auto";
  };
}

export type OpenAIContentPart = OpenAITextContent | OpenAIImageContent;

export interface OpenAIMessage {
  role: "system" | "user" | "assistant" | "tool" | "developer";
  content: string | OpenAIContentPart[] | null;
  name?: string;
  tool_calls?: OpenAIToolCall[];
  tool_call_id?: string;
}

export interface OpenAIToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface OpenAIStreamOptions {
  include_usage?: boolean;
}

export interface OpenAIFunctionDef {
  name: string;
  description?: string;
  parameters?: Record<string, unknown>;
}

export interface OpenAITool {
  type: "function";
  function: OpenAIFunctionDef;
}

export interface OpenAIChatRequest {
  model: string;
  messages: OpenAIMessage[];
  stream?: boolean;
  stream_options?: OpenAIStreamOptions;
  max_tokens?: number;
  max_completion_tokens?: number;
  temperature?: number;
  top_p?: number;
  n?: number;
  stop?: string | string[];
  frequency_penalty?: number;
  presence_penalty?: number;
  logit_bias?: Record<string, number>;
  logprobs?: boolean;
  top_logprobs?: number;
  seed?: number;
  user?: string;
  tools?: OpenAITool[];
  tool_choice?: string | object;
  response_format?: { type: string; json_schema?: unknown };
  reasoning_effort?: "low" | "medium" | "high";
}

export interface OpenAIUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface OpenAIChatResponse {
  id: string;
  object: "chat.completion";
  created: number;
  model: string;
  choices: OpenAIChatChoice[];
  usage: OpenAIUsage;
}

export interface OpenAIChatChoice {
  index: number;
  message: {
    role: "assistant";
    content: string | null;
    tool_calls?: OpenAIToolCall[];
  };
  finish_reason: string;
}

export interface OpenAIChatChunk {
  id: string;
  object: "chat.completion.chunk";
  created: number;
  model: string;
  choices: OpenAIChatChunkChoice[];
  usage?: OpenAIUsage | null;
}

export interface OpenAIToolCallDelta {
  index: number;
  id?: string;
  type?: "function";
  function?: {
    name?: string;
    arguments?: string;
  };
}

export interface OpenAIChatChunkChoice {
  index: number;
  delta: {
    role?: "assistant";
    content?: string;
    tool_calls?: OpenAIToolCallDelta[];
  };
  finish_reason: string | null;
}

export interface OpenAIModelEntry {
  id: string;
  object: "model";
  created: number;
  owned_by: string;
}

export interface OpenAIModelList {
  object: "list";
  data: OpenAIModelEntry[];
}

export interface OpenAIErrorResponse {
  error: {
    message: string;
    type: string;
    param: string | null;
    code: string | null;
  };
}
