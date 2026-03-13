import { Hono } from "hono";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { verifyJWT } from "./auth.js";
import { getStats, getStatsByModel, getHourlyStats, getRecentRequests } from "../db/queries.js";
import { config } from "../config.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const dashboard = new Hono();

/**
 * Dashboard auth middleware — checks JWT cookie.
 * Falls through if no GOOGLE_CLIENT_ID configured (dev mode).
 */
async function dashboardAuth(
  c: import("hono").Context,
  next: import("hono").Next,
) {
  if (!config.googleClientId) {
    return next();
  }

  const cookie = c.req.header("Cookie");
  const match = cookie?.match(/cmp_session=([^;]+)/);
  if (!match) {
    return c.redirect("/auth/google");
  }

  const user = await verifyJWT(match[1]);
  if (!user) {
    return c.redirect("/auth/google");
  }

  return next();
}

// Apply auth to all dashboard routes
dashboard.use("/api/stats*", dashboardAuth);

/**
 * GET / — Serve the dashboard SPA (redirects to login if not authenticated).
 */
dashboard.get("/", async (c) => {
  // Inline auth check — redirect to login if not authenticated
  if (config.googleClientId) {
    const cookie = c.req.header("Cookie");
    const match = cookie?.match(/cmp_session=([^;]+)/);
    if (!match) return c.redirect("/auth/google");
    const user = await verifyJWT(match[1]);
    if (!user) return c.redirect("/auth/google");
  }

  try {
    const html = readFileSync(join(__dirname, "../dashboard/index.html"), "utf-8");
    return c.html(html);
  } catch {
    return c.text("Dashboard not found. Ensure src/dashboard/index.html is built.", 404);
  }
});

/**
 * GET /api/stats/summary — Aggregate stats with optional time filter.
 * Query params: period (1h, 24h, 7d, 30d, all)
 */
dashboard.get("/api/stats/summary", (c) => {
  const sinceMs = parsePeriod(c.req.query("period"));
  return c.json(getStats(sinceMs));
});

/**
 * GET /api/stats/models — Stats broken down by model.
 */
dashboard.get("/api/stats/models", (c) => {
  const sinceMs = parsePeriod(c.req.query("period"));
  return c.json(getStatsByModel(sinceMs));
});

/**
 * GET /api/stats/hourly — Hourly request/token/cost buckets.
 */
dashboard.get("/api/stats/hourly", (c) => {
  const sinceMs = parsePeriod(c.req.query("period"));
  return c.json(getHourlyStats(sinceMs));
});

/**
 * GET /api/stats/recent — Recent requests.
 */
dashboard.get("/api/stats/recent", (c) => {
  const parsed = parseInt(c.req.query("limit") || "50", 10);
  const limit = Number.isNaN(parsed) ? 50 : Math.min(parsed, 200);
  return c.json(getRecentRequests(limit));
});

function parsePeriod(period?: string): number {
  const now = Date.now();
  switch (period) {
    case "1h":
      return now - 60 * 60 * 1000;
    case "24h":
      return now - 24 * 60 * 60 * 1000;
    case "7d":
      return now - 7 * 24 * 60 * 60 * 1000;
    case "30d":
      return now - 30 * 24 * 60 * 60 * 1000;
    default:
      return 0;
  }
}

export { dashboard };
