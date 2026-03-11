import { Hono } from "hono";
import { convertRequest, validateRequest } from "../conversion/openai-to-sdk.js";
import { completeNonStreaming, completeStreaming } from "../sdk/service.js";
import { badRequest, serverError, rateLimited } from "../middleware/error-handler.js";
import type { OpenAIChatRequest } from "../types/openai.js";

const chatCompletions = new Hono();

function handleSDKError(c: import("hono").Context, err: unknown) {
  const message = err instanceof Error ? err.message : "Unknown error";

  if (message.includes("rate_limit") || message.includes("rate limit")) {
    return rateLimited(c, 60);
  }
  if (message.includes("authentication") || message.includes("auth")) {
    return c.json(
      {
        error: {
          message: 'Authentication failed. Re-run "claude setup-token".',
          type: "authentication_error",
          param: null,
          code: "invalid_api_key",
        },
      },
      401,
    );
  }
  return serverError(c, message);
}

chatCompletions.post("/v1/chat/completions", async (c) => {
  let body: OpenAIChatRequest;
  try {
    body = await c.req.json<OpenAIChatRequest>();
  } catch {
    return badRequest(c, "Invalid JSON in request body");
  }

  const validationError = validateRequest(body);
  if (validationError) {
    return badRequest(c, validationError);
  }

  const params = convertRequest(body);

  // Non-streaming
  if (!params.stream) {
    try {
      const result = await completeNonStreaming(params, c.req.raw.signal);
      return c.json(result.response);
    } catch (err: unknown) {
      return handleSDKError(c, err);
    }
  }

  // Streaming
  try {
    const { stream } = completeStreaming(params, c.req.raw.signal);

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err: unknown) {
    return handleSDKError(c, err);
  }
});

export { chatCompletions };
