import { describe, it, expect, vi } from "vitest";
import {
  jsonSchemaPropertyToZod,
  jsonSchemaToZodShape,
  buildToolResultContext,
  hasToolResultMessages,
} from "./tool-handler.js";
import { z } from "zod";

describe("jsonSchemaPropertyToZod", () => {
  it("converts string type", () => {
    const zodType = jsonSchemaPropertyToZod({ type: "string" });
    expect(zodType.safeParse("hello").success).toBe(true);
    expect(zodType.safeParse(42).success).toBe(false);
  });

  it("converts number type", () => {
    const zodType = jsonSchemaPropertyToZod({ type: "number" });
    expect(zodType.safeParse(42).success).toBe(true);
    expect(zodType.safeParse("hello").success).toBe(false);
  });

  it("converts integer type (rejects non-integers)", () => {
    const zodType = jsonSchemaPropertyToZod({ type: "integer" });
    expect(zodType.safeParse(42).success).toBe(true);
    expect(zodType.safeParse(1.5).success).toBe(false);
  });

  it("converts boolean type", () => {
    const zodType = jsonSchemaPropertyToZod({ type: "boolean" });
    expect(zodType.safeParse(true).success).toBe(true);
    expect(zodType.safeParse("true").success).toBe(false);
  });

  it("converts null type", () => {
    const zodType = jsonSchemaPropertyToZod({ type: "null" });
    expect(zodType.safeParse(null).success).toBe(true);
  });

  it("converts array type", () => {
    const zodType = jsonSchemaPropertyToZod({
      type: "array",
      items: { type: "string" },
    });
    expect(zodType.safeParse(["a", "b"]).success).toBe(true);
    expect(zodType.safeParse("not array").success).toBe(false);
  });

  it("converts array without items", () => {
    const zodType = jsonSchemaPropertyToZod({ type: "array" });
    expect(zodType.safeParse([1, "two", true]).success).toBe(true);
  });

  it("converts enum", () => {
    const zodType = jsonSchemaPropertyToZod({ enum: ["celsius", "fahrenheit"] });
    expect(zodType.safeParse("celsius").success).toBe(true);
    expect(zodType.safeParse("kelvin").success).toBe(false);
  });

  it("converts object type", () => {
    const zodType = jsonSchemaPropertyToZod({
      type: "object",
      properties: { name: { type: "string" } },
      required: ["name"],
    });
    expect(zodType.safeParse({ name: "test" }).success).toBe(true);
  });

  it("returns z.any() for unknown type", () => {
    const zodType = jsonSchemaPropertyToZod({ type: "unknown_type" });
    expect(zodType.safeParse("anything").success).toBe(true);
    expect(zodType.safeParse(42).success).toBe(true);
  });

  it("returns z.any() for null/undefined input", () => {
    const zodType = jsonSchemaPropertyToZod(null as unknown as Record<string, unknown>);
    expect(zodType.safeParse("anything").success).toBe(true);
  });

  it("returns z.any() for non-string enum values", () => {
    const zodType = jsonSchemaPropertyToZod({ enum: [1, 2, 3] });
    expect(zodType.safeParse(1).success).toBe(true);
  });
});

describe("jsonSchemaToZodShape", () => {
  it("converts a simple schema", () => {
    const shape = jsonSchemaToZodShape({
      properties: {
        location: { type: "string" },
        unit: { type: "string" },
      },
      required: ["location"],
    });

    expect(Object.keys(shape)).toEqual(["location", "unit"]);
    const schema = z.object(shape);
    expect(schema.safeParse({ location: "NYC" }).success).toBe(true);
    expect(schema.safeParse({}).success).toBe(false); // location is required
  });

  it("handles empty schema", () => {
    const shape = jsonSchemaToZodShape({});
    expect(Object.keys(shape)).toEqual([]);
  });

  it("handles nested objects", () => {
    const shape = jsonSchemaToZodShape({
      properties: {
        address: {
          type: "object",
          properties: {
            city: { type: "string" },
            zip: { type: "string" },
          },
          required: ["city"],
        },
      },
      required: ["address"],
    });

    const schema = z.object(shape);
    expect(schema.safeParse({ address: { city: "NYC" } }).success).toBe(true);
  });

  it("makes non-required fields optional", () => {
    const shape = jsonSchemaToZodShape({
      properties: {
        name: { type: "string" },
        age: { type: "number" },
      },
      required: ["name"],
    });

    const schema = z.object(shape);
    expect(schema.safeParse({ name: "Alice" }).success).toBe(true);
    expect(schema.safeParse({ name: "Alice", age: 30 }).success).toBe(true);
  });
});

describe("hasToolResultMessages", () => {
  it("returns false for messages without tool role", () => {
    expect(
      hasToolResultMessages([
        { role: "user" },
        { role: "assistant" },
      ]),
    ).toBe(false);
  });

  it("returns true for messages with tool role", () => {
    expect(
      hasToolResultMessages([
        { role: "user" },
        { role: "assistant" },
        { role: "tool" },
      ]),
    ).toBe(true);
  });
});

describe("buildToolResultContext", () => {
  it("builds context with tools and tool results", () => {
    const tools = [
      {
        type: "function" as const,
        function: {
          name: "get_weather",
          description: "Get weather for a location",
          parameters: {
            type: "object",
            properties: { location: { type: "string" } },
          },
        },
      },
    ];

    const messages = [
      { role: "user", content: "What's the weather?" },
      {
        role: "assistant",
        content: null,
        tool_calls: [
          {
            id: "call_123",
            type: "function" as const,
            function: { name: "get_weather", arguments: '{"location":"SF"}' },
          },
        ],
      },
      { role: "tool", content: "72°F, sunny", tool_call_id: "call_123" },
    ];

    const context = buildToolResultContext(tools, messages);
    expect(context).toContain("get_weather");
    expect(context).toContain("Get weather for a location");
    expect(context).toContain("72°F, sunny");
    expect(context).toContain("call_123");
  });

  it("includes tool descriptions and parameter schemas", () => {
    const tools = [
      {
        type: "function" as const,
        function: {
          name: "search",
          description: "Search the web",
          parameters: { type: "object", properties: { query: { type: "string" } } },
        },
      },
    ];

    const context = buildToolResultContext(tools, []);
    expect(context).toContain("search");
    expect(context).toContain("Search the web");
    expect(context).toContain('"query"');
  });

  it("handles assistant messages with both content and tool_calls", () => {
    const messages = [
      {
        role: "assistant",
        content: "Let me check that for you.",
        tool_calls: [
          {
            id: "call_1",
            type: "function" as const,
            function: { name: "lookup", arguments: '{"q":"test"}' },
          },
        ],
      },
    ];

    const context = buildToolResultContext([], messages);
    expect(context).toContain("Let me check that for you.");
    expect(context).toContain("lookup");
  });
});
