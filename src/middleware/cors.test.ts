import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { cors } from "./cors.js";

describe("CORS middleware", () => {
  function createApp() {
    const app = new Hono();
    app.use("*", cors);
    app.get("/test", (c) => c.json({ ok: true }));
    return app;
  }

  it("sets CORS headers on regular requests", async () => {
    const app = createApp();
    const res = await app.request("/test");

    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(res.headers.get("Access-Control-Allow-Methods")).toContain("POST");
    expect(res.headers.get("Access-Control-Allow-Headers")).toContain(
      "Authorization",
    );
    expect(res.headers.get("Access-Control-Expose-Headers")).toContain(
      "X-Conversation-Id",
    );
  });

  it("returns 204 for OPTIONS preflight", async () => {
    const app = createApp();
    const res = await app.request("/test", { method: "OPTIONS" });

    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });
});
