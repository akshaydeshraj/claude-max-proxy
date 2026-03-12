import { describe, it, expect } from "vitest";
import {
  mapStopReason,
  mapResultSubtype,
  buildUsage,
  buildChatResponse,
  buildStreamChunk,
  formatSSE,
  formatSSEDone,
} from "./sdk-to-openai.js";

describe("mapStopReason", () => {
  it("maps end_turn to stop", () => {
    expect(mapStopReason("end_turn")).toBe("stop");
  });

  it("maps max_tokens to length", () => {
    expect(mapStopReason("max_tokens")).toBe("length");
  });

  it("maps refusal to content_filter", () => {
    expect(mapStopReason("refusal")).toBe("content_filter");
  });

  it("defaults to stop for unknown reasons", () => {
    expect(mapStopReason(null)).toBe("stop");
    expect(mapStopReason(undefined)).toBe("stop");
    expect(mapStopReason("unknown")).toBe("stop");
  });
});

describe("mapResultSubtype", () => {
  it("maps success to stop", () => {
    expect(mapResultSubtype("success")).toBe("stop");
  });

  it("maps budget/turn errors to length", () => {
    expect(mapResultSubtype("error_max_turns")).toBe("length");
    expect(mapResultSubtype("error_max_budget_usd")).toBe("length");
  });

  it("defaults to stop", () => {
    expect(mapResultSubtype("error_during_execution")).toBe("stop");
  });
});

describe("buildUsage", () => {
  it("computes total tokens", () => {
    const usage = buildUsage(100, 50);
    expect(usage.prompt_tokens).toBe(100);
    expect(usage.completion_tokens).toBe(50);
    expect(usage.total_tokens).toBe(150);
  });
});

describe("buildChatResponse", () => {
  it("builds a valid OpenAI response", () => {
    const resp = buildChatResponse({
      content: "Hello!",
      model: "claude-sonnet-4-6",
      finishReason: "stop",
      usage: buildUsage(10, 5),
    });

    expect(resp.object).toBe("chat.completion");
    expect(resp.id).toMatch(/^chatcmpl-/);
    expect(resp.model).toBe("claude-sonnet-4-6");
    expect(resp.choices).toHaveLength(1);
    expect(resp.choices[0].message.role).toBe("assistant");
    expect(resp.choices[0].message.content).toBe("Hello!");
    expect(resp.choices[0].finish_reason).toBe("stop");
    expect(resp.usage.total_tokens).toBe(15);
    expect(resp.created).toBeGreaterThan(0);
  });
});

describe("buildStreamChunk", () => {
  it("builds a first chunk with role", () => {
    const chunk = buildStreamChunk({
      id: "chatcmpl-123",
      model: "claude-sonnet-4-6",
      content: "Hi",
      role: "assistant",
    });

    expect(chunk.object).toBe("chat.completion.chunk");
    expect(chunk.choices[0].delta.role).toBe("assistant");
    expect(chunk.choices[0].delta.content).toBe("Hi");
    expect(chunk.choices[0].finish_reason).toBeNull();
  });

  it("builds a content-only chunk", () => {
    const chunk = buildStreamChunk({
      id: "chatcmpl-123",
      model: "claude-sonnet-4-6",
      content: " world",
    });

    expect(chunk.choices[0].delta.role).toBeUndefined();
    expect(chunk.choices[0].delta.content).toBe(" world");
  });

  it("builds a finish chunk", () => {
    const chunk = buildStreamChunk({
      id: "chatcmpl-123",
      model: "claude-sonnet-4-6",
      finishReason: "stop",
    });

    expect(chunk.choices[0].delta.content).toBeUndefined();
    expect(chunk.choices[0].finish_reason).toBe("stop");
  });

  it("builds a usage chunk", () => {
    const chunk = buildStreamChunk({
      id: "chatcmpl-123",
      model: "claude-sonnet-4-6",
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    });

    expect(chunk.usage).toEqual({
      prompt_tokens: 10,
      completion_tokens: 5,
      total_tokens: 15,
    });
  });
});

describe("formatSSE", () => {
  it("formats a chunk as SSE", () => {
    const chunk = buildStreamChunk({
      id: "chatcmpl-123",
      model: "claude-sonnet-4-6",
      content: "hi",
    });
    const sse = formatSSE(chunk);
    expect(sse).toMatch(/^data: \{.*\}\n\n$/);
    expect(JSON.parse(sse.replace("data: ", "").trim())).toEqual(chunk);
  });
});

describe("formatSSEDone", () => {
  it("formats the done marker", () => {
    expect(formatSSEDone()).toBe("data: [DONE]\n\n");
  });
});

describe("buildChatResponse with tool calls", () => {
  it("sets finish_reason to tool_calls when tool calls present", () => {
    const toolCalls = [
      {
        id: "call_123",
        type: "function" as const,
        function: { name: "get_weather", arguments: '{"location":"SF"}' },
      },
    ];

    const resp = buildChatResponse({
      content: "",
      model: "claude-sonnet-4-6",
      finishReason: "stop",
      usage: buildUsage(10, 5),
      toolCalls,
    });

    expect(resp.choices[0].finish_reason).toBe("tool_calls");
    expect(resp.choices[0].message.content).toBeNull();
    expect(resp.choices[0].message.tool_calls).toEqual(toolCalls);
  });

  it("does not include tool_calls when empty", () => {
    const resp = buildChatResponse({
      content: "Hello!",
      model: "claude-sonnet-4-6",
      finishReason: "stop",
      usage: buildUsage(10, 5),
    });

    expect(resp.choices[0].finish_reason).toBe("stop");
    expect(resp.choices[0].message.content).toBe("Hello!");
    expect(resp.choices[0].message.tool_calls).toBeUndefined();
  });

  it("does not include tool_calls when array is empty", () => {
    const resp = buildChatResponse({
      content: "Hello!",
      model: "claude-sonnet-4-6",
      finishReason: "stop",
      usage: buildUsage(10, 5),
      toolCalls: [],
    });

    expect(resp.choices[0].finish_reason).toBe("stop");
    expect(resp.choices[0].message.tool_calls).toBeUndefined();
  });
});

describe("buildStreamChunk with tool calls", () => {
  it("includes tool call deltas", () => {
    const chunk = buildStreamChunk({
      id: "chatcmpl-123",
      model: "claude-sonnet-4-6",
      role: "assistant",
      toolCalls: [
        {
          index: 0,
          id: "call_123",
          type: "function",
          function: { name: "get_weather", arguments: "" },
        },
      ],
    });

    expect(chunk.choices[0].delta.tool_calls).toHaveLength(1);
    expect(chunk.choices[0].delta.tool_calls![0].function?.name).toBe("get_weather");
  });

  it("includes argument deltas", () => {
    const chunk = buildStreamChunk({
      id: "chatcmpl-123",
      model: "claude-sonnet-4-6",
      toolCalls: [
        {
          index: 0,
          function: { arguments: '{"loc' },
        },
      ],
    });

    expect(chunk.choices[0].delta.tool_calls).toHaveLength(1);
    expect(chunk.choices[0].delta.tool_calls![0].function?.arguments).toBe('{"loc');
  });
});
