import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";
import { apiKeyAuth } from "./auth.js";
import { config } from "../config.js";

describe("apiKeyAuth middleware", () => {
  let originalApiKey: string;

  beforeEach(() => {
    originalApiKey = config.apiKey;
  });

  afterEach(() => {
    (config as { apiKey: string }).apiKey = originalApiKey;
  });

  function createApp() {
    const app = new Hono();
    app.use("*", apiKeyAuth);
    app.get("/test", (c) => c.json({ ok: true }));
    return app;
  }

  it("passes through when no API key configured", async () => {
    (config as { apiKey: string }).apiKey = "";
    const app = createApp();

    const res = await app.request("/test");
    expect(res.status).toBe(200);
  });

  it("rejects missing Authorization header", async () => {
    (config as { apiKey: string }).apiKey = "test-key-123";
    const app = createApp();

    const res = await app.request("/test");
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.message).toContain("Missing Authorization");
  });

  it("rejects invalid header format", async () => {
    (config as { apiKey: string }).apiKey = "test-key-123";
    const app = createApp();

    const res = await app.request("/test", {
      headers: { Authorization: "Basic abc123" },
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.message).toContain("Invalid Authorization");
  });

  it("rejects wrong API key", async () => {
    (config as { apiKey: string }).apiKey = "test-key-123";
    const app = createApp();

    const res = await app.request("/test", {
      headers: { Authorization: "Bearer wrong-key" },
    });
    expect(res.status).toBe(401);
  });

  it("allows correct API key", async () => {
    (config as { apiKey: string }).apiKey = "test-key-123";
    const app = createApp();

    const res = await app.request("/test", {
      headers: { Authorization: "Bearer test-key-123" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });
});
