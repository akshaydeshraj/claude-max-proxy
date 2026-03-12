import { describe, it, expect } from "vitest";
import {
  extractTextFromContent,
  extractSystemPrompt,
  extractLastUserMessage,
  extractLastUserContentBlocks,
  hasImageContent,
  convertRequest,
  validateRequest,
} from "./openai-to-sdk.js";
import type { OpenAIChatRequest, OpenAIMessage } from "../types/openai.js";

describe("extractTextFromContent", () => {
  it("handles string content", () => {
    expect(extractTextFromContent("hello")).toBe("hello");
  });

  it("handles null content", () => {
    expect(extractTextFromContent(null)).toBe("");
  });

  it("handles content parts array", () => {
    expect(
      extractTextFromContent([
        { type: "text", text: "hello" },
        { type: "text", text: " world" },
      ]),
    ).toBe("hello\n world");
  });

  it("filters out non-text parts", () => {
    expect(
      extractTextFromContent([
        { type: "text", text: "hello" },
        { type: "image_url", image_url: { url: "data:image/png;base64,abc" } },
      ]),
    ).toBe("hello");
  });
});

describe("extractSystemPrompt", () => {
  it("extracts system messages", () => {
    const messages: OpenAIMessage[] = [
      { role: "system", content: "You are helpful." },
      { role: "user", content: "Hi" },
    ];
    expect(extractSystemPrompt(messages)).toBe("You are helpful.");
  });

  it("combines multiple system messages", () => {
    const messages: OpenAIMessage[] = [
      { role: "system", content: "Rule 1" },
      { role: "developer", content: "Rule 2" },
      { role: "user", content: "Hi" },
    ];
    expect(extractSystemPrompt(messages)).toBe("Rule 1\n\nRule 2");
  });

  it("returns undefined when no system messages", () => {
    const messages: OpenAIMessage[] = [{ role: "user", content: "Hi" }];
    expect(extractSystemPrompt(messages)).toBeUndefined();
  });
});

describe("extractLastUserMessage", () => {
  it("extracts the last user message", () => {
    const messages: OpenAIMessage[] = [
      { role: "user", content: "First" },
      { role: "assistant", content: "Reply" },
      { role: "user", content: "Second" },
    ];
    expect(extractLastUserMessage(messages)).toBe("Second");
  });

  it("returns empty string when no user messages", () => {
    const messages: OpenAIMessage[] = [
      { role: "system", content: "System" },
    ];
    expect(extractLastUserMessage(messages)).toBe("");
  });
});

describe("hasImageContent", () => {
  it("returns false for text-only messages", () => {
    const messages: OpenAIMessage[] = [
      { role: "user", content: "Hello" },
      { role: "user", content: [{ type: "text", text: "Hi" }] },
    ];
    expect(hasImageContent(messages)).toBe(false);
  });

  it("returns true when images present", () => {
    const messages: OpenAIMessage[] = [
      {
        role: "user",
        content: [
          { type: "text", text: "What's this?" },
          { type: "image_url", image_url: { url: "data:image/png;base64,abc" } },
        ],
      },
    ];
    expect(hasImageContent(messages)).toBe(true);
  });

  it("handles null content", () => {
    const messages: OpenAIMessage[] = [
      { role: "assistant", content: null },
    ];
    expect(hasImageContent(messages)).toBe(false);
  });
});

describe("extractLastUserContentBlocks", () => {
  it("returns undefined for string content", () => {
    const messages: OpenAIMessage[] = [{ role: "user", content: "Hello" }];
    expect(extractLastUserContentBlocks(messages)).toBeUndefined();
  });

  it("returns undefined for text-only parts", () => {
    const messages: OpenAIMessage[] = [
      { role: "user", content: [{ type: "text", text: "Hello" }] },
    ];
    expect(extractLastUserContentBlocks(messages)).toBeUndefined();
  });

  it("returns content blocks when images present", () => {
    const messages: OpenAIMessage[] = [
      {
        role: "user",
        content: [
          { type: "text", text: "What's this?" },
          {
            type: "image_url",
            image_url: { url: "https://example.com/cat.png" },
          },
        ],
      },
    ];

    const blocks = extractLastUserContentBlocks(messages);
    expect(blocks).toHaveLength(2);
    expect(blocks![0]).toEqual({ type: "text", text: "What's this?" });
    expect(blocks![1]).toEqual({
      type: "image",
      source: { type: "url", url: "https://example.com/cat.png" },
    });
  });

  it("returns undefined when no user messages", () => {
    const messages: OpenAIMessage[] = [{ role: "system", content: "Hi" }];
    expect(extractLastUserContentBlocks(messages)).toBeUndefined();
  });

  it("returns undefined for null content", () => {
    const messages: OpenAIMessage[] = [{ role: "user", content: null }];
    expect(extractLastUserContentBlocks(messages)).toBeUndefined();
  });
});

describe("convertRequest", () => {
  it("converts a basic request", () => {
    const req: OpenAIChatRequest = {
      model: "claude-sonnet-4-6",
      messages: [
        { role: "system", content: "Be concise" },
        { role: "user", content: "Hello" },
      ],
    };

    const result = convertRequest(req);
    expect(result.model).toBe("claude-sonnet-4-6");
    expect(result.prompt).toBe("Hello");
    expect(result.systemPrompt).toBe("Be concise");
    expect(result.stream).toBe(false);
    expect(result.includeUsageInStream).toBe(false);
  });

  it("passes model through as-is (no mapping)", () => {
    const req: OpenAIChatRequest = {
      model: "sonnet",
      messages: [{ role: "user", content: "Hi" }],
    };
    expect(convertRequest(req).model).toBe("sonnet");
  });

  it("handles streaming with usage", () => {
    const req: OpenAIChatRequest = {
      model: "claude-opus-4-6",
      messages: [{ role: "user", content: "Hi" }],
      stream: true,
      stream_options: { include_usage: true },
    };

    const result = convertRequest(req);
    expect(result.stream).toBe(true);
    expect(result.includeUsageInStream).toBe(true);
  });

  it("maps reasoning_effort to effort", () => {
    const req: OpenAIChatRequest = {
      model: "sonnet",
      messages: [{ role: "user", content: "Hi" }],
      reasoning_effort: "low",
    };

    const result = convertRequest(req);
    expect(result.effort).toBe("low");
  });

  it("includes promptContentBlocks when images present", () => {
    const req: OpenAIChatRequest = {
      model: "sonnet",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "Describe" },
            { type: "image_url", image_url: { url: "https://example.com/img.jpg" } },
          ],
        },
      ],
    };

    const result = convertRequest(req);
    expect(result.promptContentBlocks).toHaveLength(2);
    expect(result.prompt).toBe("Describe");
  });

  it("injects json_object response_format into system prompt", () => {
    const req: OpenAIChatRequest = {
      model: "sonnet",
      messages: [{ role: "user", content: "Hi" }],
      response_format: { type: "json_object" },
    };

    const result = convertRequest(req);
    expect(result.systemPrompt).toBe("Respond with valid JSON only.");
  });

  it("appends json_object to existing system prompt", () => {
    const req: OpenAIChatRequest = {
      model: "sonnet",
      messages: [
        { role: "system", content: "Be helpful" },
        { role: "user", content: "Hi" },
      ],
      response_format: { type: "json_object" },
    };

    const result = convertRequest(req);
    expect(result.systemPrompt).toBe(
      "Be helpful\n\nRespond with valid JSON only.",
    );
  });

  it("injects json_schema into system prompt", () => {
    const schema = { type: "object", properties: { name: { type: "string" } } };
    const req: OpenAIChatRequest = {
      model: "sonnet",
      messages: [{ role: "user", content: "Hi" }],
      response_format: { type: "json_schema", json_schema: schema },
    };

    const result = convertRequest(req);
    expect(result.systemPrompt).toContain("Respond with valid JSON only.");
    expect(result.systemPrompt).toContain(JSON.stringify(schema));
  });

  it("ignores text response_format", () => {
    const req: OpenAIChatRequest = {
      model: "sonnet",
      messages: [{ role: "user", content: "Hi" }],
      response_format: { type: "text" },
    };

    const result = convertRequest(req);
    expect(result.systemPrompt).toBeUndefined();
  });
});

describe("validateRequest", () => {
  it("rejects null body", () => {
    expect(validateRequest(null)).toBe("Request body must be a JSON object");
  });

  it("rejects array body", () => {
    expect(validateRequest([1, 2, 3])).toBe("Request body must be a JSON object");
  });

  it("rejects number body", () => {
    expect(validateRequest(42)).toBe("Request body must be a JSON object");
  });

  it("returns null for valid request", () => {
    expect(
      validateRequest({
        model: "sonnet",
        messages: [{ role: "user", content: "Hi" }],
      }),
    ).toBeNull();
  });

  it("rejects empty messages", () => {
    expect(validateRequest({ model: "sonnet", messages: [] })).toBe(
      "messages is required and must be a non-empty array",
    );
  });

  it("rejects missing model", () => {
    expect(
      validateRequest({
        model: "",
        messages: [{ role: "user", content: "Hi" }],
      }),
    ).toBe("model is required");
  });

  it("rejects n > 1", () => {
    expect(
      validateRequest({
        model: "sonnet",
        messages: [{ role: "user", content: "Hi" }],
        n: 2,
      }),
    ).toBe("n > 1 is not supported");
  });

  it("allows tool_choice required (tools now supported)", () => {
    expect(
      validateRequest({
        model: "sonnet",
        messages: [{ role: "user", content: "Hi" }],
        tool_choice: "required",
      }),
    ).toBeNull();
  });

  it("allows tool_choice auto", () => {
    expect(
      validateRequest({
        model: "sonnet",
        messages: [{ role: "user", content: "Hi" }],
        tool_choice: "auto",
      }),
    ).toBeNull();
  });
});

describe("convertRequest with tools", () => {
  it("passes tools through to SDK params", () => {
    const req: OpenAIChatRequest = {
      model: "sonnet",
      messages: [{ role: "user", content: "Hi" }],
      tools: [
        {
          type: "function",
          function: {
            name: "get_weather",
            description: "Get weather",
            parameters: { type: "object", properties: { location: { type: "string" } } },
          },
        },
      ],
    };

    const result = convertRequest(req);
    expect(result.tools).toHaveLength(1);
    expect(result.tools![0].function.name).toBe("get_weather");
  });

  it("sets tools to undefined when empty", () => {
    const req: OpenAIChatRequest = {
      model: "sonnet",
      messages: [{ role: "user", content: "Hi" }],
      tools: [],
    };

    const result = convertRequest(req);
    expect(result.tools).toBeUndefined();
  });

  it("injects tool result context into system prompt", () => {
    const req: OpenAIChatRequest = {
      model: "sonnet",
      messages: [
        { role: "user", content: "What's the weather?" },
        {
          role: "assistant",
          content: null,
          tool_calls: [
            { id: "call_1", type: "function", function: { name: "get_weather", arguments: '{"location":"SF"}' } },
          ],
        },
        { role: "tool", content: "72°F", tool_call_id: "call_1" },
        { role: "user", content: "Thanks, and in NYC?" },
      ],
      tools: [
        {
          type: "function",
          function: { name: "get_weather", description: "Get weather" },
        },
      ],
    };

    const result = convertRequest(req);
    expect(result.systemPrompt).toContain("get_weather");
    expect(result.systemPrompt).toContain("72°F");
  });
});
