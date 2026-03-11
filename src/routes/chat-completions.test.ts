import { describe, it, expect, vi } from "vitest";
import { Hono } from "hono";

// Mock the SDK service before importing the route
vi.mock("../sdk/service.js", () => ({
  completeNonStreaming: vi.fn(),
  completeStreaming: vi.fn(),
}));

import { chatCompletions } from "./chat-completions.js";
import { completeNonStreaming, completeStreaming } from "../sdk/service.js";

const app = new Hono();
app.route("/", chatCompletions);

function makeRequest(body: unknown, headers?: Record<string, string>) {
  return app.request("/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("POST /v1/chat/completions", () => {
  describe("validation", () => {
    it("rejects invalid JSON", async () => {
      const res = await app.request("/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not json",
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.type).toBe("invalid_request_error");
    });

    it("rejects empty messages", async () => {
      const res = await makeRequest({ model: "sonnet", messages: [] });
      expect(res.status).toBe(400);
    });

    it("rejects missing model", async () => {
      const res = await makeRequest({
        model: "",
        messages: [{ role: "user", content: "hi" }],
      });
      expect(res.status).toBe(400);
    });

    it("rejects n > 1", async () => {
      const res = await makeRequest({
        model: "sonnet",
        messages: [{ role: "user", content: "hi" }],
        n: 3,
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.message).toContain("n > 1");
    });

    it("rejects tool_choice required", async () => {
      const res = await makeRequest({
        model: "sonnet",
        messages: [{ role: "user", content: "hi" }],
        tool_choice: "required",
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.message).toContain("tool use");
    });
  });

  describe("non-streaming", () => {
    it("returns OpenAI-format response on success", async () => {
      const mockResponse = {
        response: {
          id: "chatcmpl-123",
          object: "chat.completion",
          created: 1234567890,
          model: "claude-sonnet-4-6",
          choices: [
            {
              index: 0,
              message: { role: "assistant", content: "Hello!" },
              finish_reason: "stop",
            },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        },
        costUsd: 0.001,
        inputTokens: 10,
        outputTokens: 5,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        durationMs: 500,
      };

      vi.mocked(completeNonStreaming).mockResolvedValueOnce(mockResponse);

      const res = await makeRequest({
        model: "sonnet",
        messages: [{ role: "user", content: "Hello" }],
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.object).toBe("chat.completion");
      expect(body.choices[0].message.content).toBe("Hello!");
      expect(body.usage.total_tokens).toBe(15);
    });

    it("returns 429 on rate limit error", async () => {
      vi.mocked(completeNonStreaming).mockRejectedValueOnce(
        new Error("rate_limit exceeded"),
      );

      const res = await makeRequest({
        model: "sonnet",
        messages: [{ role: "user", content: "hi" }],
      });

      expect(res.status).toBe(429);
      const body = await res.json();
      expect(body.error.type).toBe("rate_limit_error");
    });

    it("returns 401 on auth error", async () => {
      vi.mocked(completeNonStreaming).mockRejectedValueOnce(
        new Error("authentication failed"),
      );

      const res = await makeRequest({
        model: "sonnet",
        messages: [{ role: "user", content: "hi" }],
      });

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error.type).toBe("authentication_error");
    });

    it("returns 500 on unknown error", async () => {
      vi.mocked(completeNonStreaming).mockRejectedValueOnce(
        new Error("something broke"),
      );

      const res = await makeRequest({
        model: "sonnet",
        messages: [{ role: "user", content: "hi" }],
      });

      expect(res.status).toBe(500);
    });
  });

  describe("streaming", () => {
    it("returns SSE response with correct headers", async () => {
      const mockStream = new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder();
          controller.enqueue(
            encoder.encode(
              'data: {"id":"chatcmpl-1","object":"chat.completion.chunk","created":1,"model":"claude-sonnet-4-6","choices":[{"index":0,"delta":{"role":"assistant","content":"Hi"},"finish_reason":null}]}\n\n',
            ),
          );
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        },
      });

      vi.mocked(completeStreaming).mockReturnValueOnce({
        stream: mockStream,
        statsPromise: Promise.resolve({
          costUsd: 0.001,
          inputTokens: 10,
          outputTokens: 5,
          cacheCreationTokens: 0,
          cacheReadTokens: 0,
          durationMs: 200,
        }),
      });

      const res = await makeRequest({
        model: "sonnet",
        messages: [{ role: "user", content: "hi" }],
        stream: true,
      });

      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("text/event-stream");
      expect(res.headers.get("Cache-Control")).toBe("no-cache");

      const text = await res.text();
      expect(text).toContain("data: ");
      expect(text).toContain("[DONE]");
    });
  });
});
