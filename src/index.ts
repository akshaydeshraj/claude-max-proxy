import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { chatCompletions } from "./routes/chat-completions.js";
import { models } from "./routes/models.js";
import { health } from "./routes/health.js";
import { auth } from "./routes/auth.js";
import { apiKeyAuth } from "./middleware/auth.js";
import { cors } from "./middleware/cors.js";
import { config } from "./config.js";
import { startCleanupInterval } from "./sdk/sessions.js";

const app = new Hono();

// Global middleware
app.use("*", cors);

// Public routes (no auth)
app.route("/", health);
app.route("/", auth);

// API routes (API key auth)
app.use("/v1/*", apiKeyAuth);
app.route("/", models);
app.route("/", chatCompletions);

// Start session cleanup
startCleanupInterval();

serve(
  {
    fetch: app.fetch,
    port: config.port,
  },
  (info) => {
    console.log(`Claude Max Proxy running on http://localhost:${info.port}`);
  },
);

export { app };
