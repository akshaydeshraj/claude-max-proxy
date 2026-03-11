import { query } from "@anthropic-ai/claude-agent-sdk";
import { v4 as uuidv4 } from "uuid";
import type { SDKQueryParams } from "../conversion/openai-to-sdk.js";
import {
  buildChatResponse,
  buildUsage,
  buildStreamChunk,
  formatSSE,
  formatSSEDone,
  mapStopReason,
  mapResultSubtype,
} from "../conversion/sdk-to-openai.js";
import { Semaphore } from "./semaphore.js";
import { getSession, setSession, updateSessionUsage } from "./sessions.js";
import { config } from "../config.js";
import type { OpenAIChatResponse } from "../types/openai.js";

const semaphore = new Semaphore(config.maxConcurrentRequests);

const DISALLOWED_TOOLS = [
  "Bash",
  "Read",
  "Write",
  "Edit",
  "Glob",
  "Grep",
  "WebSearch",
  "WebFetch",
  "Agent",
  "TodoWrite",
  "NotebookEdit",
];

export interface SDKCompletionResult {
  response: OpenAIChatResponse;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  durationMs: number;
  sdkSessionId?: string;
}

export interface SDKStreamResult {
  stream: ReadableStream<Uint8Array>;
  statsPromise: Promise<{
    costUsd: number;
    inputTokens: number;
    outputTokens: number;
    cacheCreationTokens: number;
    cacheReadTokens: number;
    durationMs: number;
  }>;
}

function buildSDKOptions(
  params: SDKQueryParams,
  abortController: AbortController,
  sdkSessionId?: string,
) {
  const options: Record<string, unknown> = {
    model: params.model,
    allowedTools: [],
    disallowedTools: DISALLOWED_TOOLS,
    permissionMode: "dontAsk",
    persistSession: false,
    includePartialMessages: params.stream,
    maxBudgetUsd: config.maxBudgetPerRequest,
    abortController,
  };

  if (params.systemPrompt) {
    options.systemPrompt = params.systemPrompt;
  }
  if (params.effort) {
    options.effort = params.effort;
  }
  if (sdkSessionId) {
    options.resume = sdkSessionId;
  }

  return options;
}

function resolveSDKSessionId(conversationId?: string | null): string | undefined {
  if (!conversationId) return undefined;
  const session = getSession(conversationId);
  return session?.sdkSessionId;
}

function storeSession(
  conversationId: string | null | undefined,
  sdkSessionId: string | undefined,
  model: string,
  messageCount: number,
): void {
  if (!conversationId || !sdkSessionId) return;

  const existing = getSession(conversationId);
  if (existing) {
    updateSessionUsage(conversationId, messageCount);
  } else {
    const now = Date.now();
    setSession(conversationId, {
      sdkSessionId,
      model,
      createdAt: now,
      lastUsedAt: now,
      messageCount,
    });
  }
}

function setupAbort(abortSignal?: AbortSignal) {
  const abortController = new AbortController();

  if (abortSignal) {
    abortSignal.addEventListener("abort", () => abortController.abort());
  }

  const timeout = setTimeout(
    () => abortController.abort(),
    config.requestTimeoutMs,
  );

  return { abortController, timeout };
}

function extractUsageFromResult(message: { usage?: unknown; total_cost_usd?: number }) {
  let costUsd = message.total_cost_usd ?? 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheCreationTokens = 0;
  let cacheReadTokens = 0;

  if (message.usage) {
    const usage = message.usage as Record<string, number>;
    inputTokens = usage.input_tokens ?? 0;
    outputTokens = usage.output_tokens ?? 0;
    cacheCreationTokens = usage.cache_creation_input_tokens ?? 0;
    cacheReadTokens = usage.cache_read_input_tokens ?? 0;
  }

  return { costUsd, inputTokens, outputTokens, cacheCreationTokens, cacheReadTokens };
}

export async function completeNonStreaming(
  params: SDKQueryParams,
  abortSignal?: AbortSignal,
): Promise<SDKCompletionResult> {
  await semaphore.acquire();
  const startTime = Date.now();

  try {
    const { abortController, timeout } = setupAbort(abortSignal);
    const existingSessionId = resolveSDKSessionId(params.conversationId);
    const options = buildSDKOptions(params, abortController, existingSessionId);

    let content = "";
    let finishReason = "stop";
    let sdkSessionId: string | undefined;
    let stats = { costUsd: 0, inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0 };

    const q = query({
      prompt: params.prompt,
      options: options as never,
    });

    for await (const message of q) {
      if (message.type === "assistant" && message.message?.content) {
        for (const block of message.message.content) {
          if ("text" in block) {
            content += block.text;
          }
        }
      } else if (message.type === "result") {
        finishReason = message.subtype
          ? mapResultSubtype(message.subtype)
          : "stop";
        stats = extractUsageFromResult(message);
        sdkSessionId = (message as Record<string, unknown>).session_id as string | undefined;
      }
    }

    clearTimeout(timeout);

    // Store session for multi-turn
    storeSession(params.conversationId, sdkSessionId, params.model, params.messageCount);

    const durationMs = Date.now() - startTime;
    const usage = buildUsage(stats.inputTokens, stats.outputTokens);
    const response = buildChatResponse({
      content,
      model: params.model,
      finishReason,
      usage,
    });

    return {
      response,
      ...stats,
      durationMs,
      sdkSessionId,
    };
  } finally {
    semaphore.release();
  }
}

export function completeStreaming(
  params: SDKQueryParams,
  abortSignal?: AbortSignal,
): SDKStreamResult {
  const chunkId = `chatcmpl-${uuidv4()}`;
  let firstChunk = true;
  let statsResolve!: (value: SDKStreamResult["statsPromise"] extends Promise<infer T> ? T : never) => void;

  const statsPromise = new Promise<{
    costUsd: number;
    inputTokens: number;
    outputTokens: number;
    cacheCreationTokens: number;
    cacheReadTokens: number;
    durationMs: number;
  }>((resolve) => {
    statsResolve = resolve;
  });

  const encoder = new TextEncoder();
  const startTime = Date.now();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      await semaphore.acquire();

      try {
        const { abortController, timeout } = setupAbort(abortSignal);
        const existingSessionId = resolveSDKSessionId(params.conversationId);
        const options = buildSDKOptions(params, abortController, existingSessionId);

        const q = query({
          prompt: params.prompt,
          options: options as never,
        });

        for await (const message of q) {
          if (message.type === "stream_event") {
            const event = (message as unknown as { event: { type: string; delta?: { type: string; text?: string } } }).event;

            if (
              event.type === "content_block_delta" &&
              event.delta?.type === "text_delta" &&
              event.delta.text
            ) {
              const chunk = buildStreamChunk({
                id: chunkId,
                model: params.model,
                content: event.delta.text,
                role: firstChunk ? "assistant" : undefined,
              });
              controller.enqueue(encoder.encode(formatSSE(chunk)));
              firstChunk = false;
            }
          } else if (message.type === "result") {
            const stats = extractUsageFromResult(message);
            const finishReason = message.subtype
              ? mapResultSubtype(message.subtype)
              : "stop";

            // Store session for multi-turn
            const sdkSessionId = (message as Record<string, unknown>).session_id as string | undefined;
            storeSession(params.conversationId, sdkSessionId, params.model, params.messageCount);

            // Finish chunk
            const finishChunk = buildStreamChunk({
              id: chunkId,
              model: params.model,
              finishReason,
            });
            controller.enqueue(encoder.encode(formatSSE(finishChunk)));

            // Usage chunk if requested
            if (params.includeUsageInStream) {
              const usageChunk = buildStreamChunk({
                id: chunkId,
                model: params.model,
                usage: buildUsage(stats.inputTokens, stats.outputTokens),
              });
              controller.enqueue(encoder.encode(formatSSE(usageChunk)));
            }

            // Done
            controller.enqueue(encoder.encode(formatSSEDone()));

            clearTimeout(timeout);
            statsResolve({
              ...stats,
              durationMs: Date.now() - startTime,
            });
          }
        }
      } catch (err) {
        // On error, try to send an error event before closing
        const errorMessage = err instanceof Error ? err.message : "Unknown error";
        const errorChunk = `data: ${JSON.stringify({ error: { message: errorMessage, type: "server_error" } })}\n\n`;
        controller.enqueue(encoder.encode(errorChunk));
        controller.enqueue(encoder.encode(formatSSEDone()));

        statsResolve({
          costUsd: 0,
          inputTokens: 0,
          outputTokens: 0,
          cacheCreationTokens: 0,
          cacheReadTokens: 0,
          durationMs: Date.now() - startTime,
        });
      } finally {
        controller.close();
        semaphore.release();
      }
    },
  });

  return { stream, statsPromise };
}
