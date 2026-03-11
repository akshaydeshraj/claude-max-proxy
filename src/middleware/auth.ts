import type { Context, Next } from "hono";
import { config } from "../config.js";
import { unauthorized } from "./error-handler.js";

/**
 * API key authentication middleware.
 * Validates the Bearer token against the configured API_KEY.
 * If no API_KEY is configured, all requests pass through (development mode).
 */
export async function apiKeyAuth(c: Context, next: Next) {
  // Skip auth if no API key configured (dev mode)
  if (!config.apiKey) {
    return next();
  }

  const authHeader = c.req.header("Authorization");
  if (!authHeader) {
    return unauthorized(c, "Missing Authorization header");
  }

  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return unauthorized(c, "Invalid Authorization header format. Expected: Bearer <token>");
  }

  const token = match[1];
  if (token !== config.apiKey) {
    return unauthorized(c);
  }

  return next();
}
