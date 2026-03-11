# Commits Log

## Phase 1: Core Proxy (non-streaming, single-turn)

### Commit 1 — Project scaffold + conversion layer + tests

**Files created:**
- `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`
- `src/config.ts` — environment configuration
- `src/types/openai.ts` — full OpenAI API type definitions
- `src/conversion/model-map.ts` — model name mapping (OpenAI → Claude)
- `src/conversion/openai-to-sdk.ts` — request conversion (messages → prompt)
- `src/conversion/sdk-to-openai.ts` — response conversion (SDK → OpenAI format)
- `src/sdk/semaphore.ts` — concurrency limiter
- `src/sdk/service.ts` — SDK query() wrapper (non-streaming)
- `src/middleware/error-handler.ts` — OpenAI-format error responses
- `src/routes/chat-completions.ts` — POST /v1/chat/completions
- `src/routes/models.ts` — GET /v1/models
- `src/routes/health.ts` — GET /health
- `src/index.ts` — Hono app entry point

**Tests:** 53 passing (7 test files)
**Coverage:**
- Statements: 56.06%
- Branches: 64.17%
- Functions: 78.04%
- Lines: 54.26%
- Pure logic files (conversion/, model-map, semaphore): 100%
- SDK service & route handlers: 0% (require SDK mocking or integration tests)

## Phase 2: Streaming

### Commit 2 — Streaming support + route handler tests

**Files modified:**
- `src/sdk/service.ts` — added `completeStreaming()` with ReadableStream SSE output, stats promise, error handling
- `src/routes/chat-completions.ts` — added streaming path returning SSE Response, `handleSDKError()` for rate limit/auth/500

**Files created:**
- `src/routes/chat-completions.test.ts` — 10 tests covering validation (invalid JSON, empty messages, missing model, n>1, tool_choice:required), non-streaming (success, rate limit 429, auth 401, unknown 500), streaming (SSE headers + content)

**Tests:** 63 passing (8 test files)
**Coverage:**
- Statements: 56.56%
- Branches: 68.21%
- Functions: 77.08%
- Lines: 55.18%
- Route handler (chat-completions.ts): 95.83% statements
- Pure logic files (conversion/, model-map, semaphore): 100%
- SDK service.ts: 0% (requires Agent SDK — tested via mocked route tests)
