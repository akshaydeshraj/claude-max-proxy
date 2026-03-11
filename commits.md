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

## Phase 3: Session Management (multi-turn)

### Commit 3 — Session-based multi-turn conversation support

**Files created:**
- `src/sdk/sessions.ts` — in-memory session store with conversation ID resolution (header or message hash), TTL cleanup, CRUD operations
- `src/sdk/sessions.test.ts` — 18 tests covering hash prefix, conversation ID resolution, session CRUD, TTL cleanup, interval management

**Files modified:**
- `src/conversion/openai-to-sdk.ts` — added `conversationId` and `messageCount` to `SDKQueryParams`
- `src/sdk/service.ts` — added session resolution/storage, passes `resume` to SDK for multi-turn, returns `sdkSessionId`
- `src/routes/chat-completions.ts` — resolves conversation ID from header/messages, passes to SDK, returns `X-Conversation-Id` and `X-Session-Id` headers

**Tests:** 81 passing (9 test files)
**Coverage:**
- Statements: 58.74%
- Branches: 65.76%
- Functions: 78.68%
- Lines: 57.56%
- sessions.ts: 100% statements
- Pure logic files (conversion/, model-map, semaphore): 100%

## Phase 4: Image Support + response_format

### Commit 4 — Image conversion and response_format handling

**Files created:**
- `src/conversion/image-handler.ts` — parse data URIs, convert OpenAI image_url to Anthropic base64/URL image blocks
- `src/conversion/image-handler.test.ts` — 13 tests for data URI parsing, base64/URL conversion, mixed content

**Files modified:**
- `src/conversion/openai-to-sdk.ts` — added `extractLastUserContentBlocks()` for image content, `response_format` injection (json_object + json_schema → system prompt), `promptContentBlocks` in SDKQueryParams
- `src/conversion/openai-to-sdk.test.ts` — added 10 tests for content blocks extraction, image support, response_format handling

**Tests:** 104 passing (10 test files)
**Coverage:**
- Statements: 63.23%
- Branches: 69.52%
- Functions: 80.59%
- Lines: 61.92%
- All conversion files: 100%
- image-handler.ts: 100%

## Phase 5: Auth

### Commit 5 — API key auth, CORS, Google OAuth, JWT

**Files created:**
- `src/middleware/auth.ts` — API key Bearer token validation, dev mode pass-through
- `src/middleware/auth.test.ts` — 5 tests (dev mode, missing header, bad format, wrong key, correct key)
- `src/middleware/cors.ts` — CORS headers with exposed custom headers
- `src/middleware/cors.test.ts` — 2 tests (regular request headers, OPTIONS preflight)
- `src/routes/auth.ts` — Google OAuth flow (/auth/google, /auth/callback), JWT create/verify, /auth/me, /auth/logout
- `src/routes/auth.test.ts` — 9 tests (JWT create/verify, OAuth not configured, missing code, cookie auth, logout)

**Files modified:**
- `src/index.ts` — wired CORS globally, API key auth on /v1/*, auth routes, session cleanup

**Tests:** 120 passing (13 test files)
**Coverage:**
- Statements: 63.63%
- Branches: 67.21%
- Functions: 84.21%
- Lines: 62.59%
- auth middleware: 100%, cors: 100%, error-handler: 100%

## Phase 6: Analytics

### Commit 6 — SQLite analytics, stats API, request logging

**Files created:**
- `src/db/index.ts` — SQLite connection with WAL mode, migrations for requests table
- `src/db/queries.ts` — logRequest, getStats, getStatsByModel, getHourlyStats, getRecentRequests
- `src/db/queries.test.ts` — 9 tests with real SQLite (test DB), covering insert, aggregation, model breakdown, hourly buckets, recent ordering, limits
- `src/routes/dashboard.ts` — stats API endpoints (/api/stats/summary, models, hourly, recent) with period filtering and JWT cookie auth

**Files modified:**
- `src/routes/chat-completions.ts` — added request logging (fire-and-forget) for both streaming and non-streaming
- `src/routes/chat-completions.test.ts` — added db/queries mock
- `src/index.ts` — wired dashboard routes

**Tests:** 129 passing (14 test files)
**Coverage:**
- Statements: 61.85%
- Branches: 66.54%
- Functions: 79.12%
- Lines: 60.81%
- db/index.ts: 100%, db/queries.ts: 100%

## Phase 7: Docker + Dashboard

### Commit 7 — Dockerfile, docker-compose, dashboard SPA, .env.example

**Files created:**
- `Dockerfile` — Node.js 22 slim with Claude CLI, multi-stage build
- `docker-compose.yml` — service config with SQLite + credentials volumes
- `.env.example` — all configurable environment variables
- `src/dashboard/index.html` — SPA with Alpine.js + Chart.js (dark theme, stats cards, hourly chart, model breakdown, recent requests table)

**Files modified:**
- `src/routes/dashboard.ts` — added GET /dashboard serving the SPA HTML
- `.gitignore` — added SQLite db files

**Tests:** 129 passing (14 test files)
**Coverage:**
- Statements: 61.06%
- Branches: 66.54%
- Functions: 78.26%
- Lines: 60.00%

### Summary: All 7 Phases Complete

| Phase | Tests | Key Coverage |
|-------|-------|-------------|
| 1. Core Proxy | 53 | conversion: 100% |
| 2. Streaming | 63 | route handler: 96% |
| 3. Sessions | 81 | sessions: 100% |
| 4. Images | 104 | image-handler: 100% |
| 5. Auth | 120 | auth middleware: 100% |
| 6. Analytics | 129 | db: 100% |
| 7. Docker | 129 | TypeScript compiles clean |
