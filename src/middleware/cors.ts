import type { Context, Next } from "hono";

/**
 * CORS middleware that allows all origins.
 * Required for browser-based clients and dashboard.
 */
export async function cors(c: Context, next: Next) {
  c.header("Access-Control-Allow-Origin", "*");
  c.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  c.header(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Conversation-Id",
  );
  c.header(
    "Access-Control-Expose-Headers",
    "X-Conversation-Id, X-Session-Id, Retry-After",
  );

  if (c.req.method === "OPTIONS") {
    return c.body(null, 204);
  }

  return next();
}
