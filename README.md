# claude-max-proxy

An OpenAI-compatible API proxy for Claude Max subscribers. Use your Claude Max subscription with any tool that supports the OpenAI API — Cursor, Continue, Open WebUI, and more.

**No hacks. No magic. Just format translation using Anthropic's official SDK.**

## Is This Allowed?

**Yes.** We use Anthropic's official [`@anthropic-ai/claude-agent-sdk`](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk). You authenticate with `claude setup-token` using your own account. No credentials are stored, shared, or proxied.

Anthropic employees have explicitly confirmed personal use is fine:

> *"We want to encourage local development and experimentation with the Agent SDK and `claude -p`"*
> — Thariq Shihipar, Anthropic

> *"Personal use and local experimentation are fine. If you're building a business on the Agent SDK, use an API key."*

> *"Nothing changes around how customers have been using their account and Anthropic will not be canceling accounts."*
> — Official Anthropic statement

## Features

- **Full OpenAI API compatibility** — `/v1/chat/completions` and `/v1/models`
- **Function calling / tool use** — OpenAI-compatible tool calling via MCP bridge
- **Streaming** — SSE with `data:` chunks and `[DONE]` terminator
- **Image support** — base64 data URIs and URL images
- **Multi-turn sessions** — automatic session management with prompt caching
- **Analytics dashboard** — token usage, cost tracking, model breakdown
- **Auth** — API key for clients + Google OAuth for dashboard
- **Docker ready** — `docker compose up` for Coolify or any Docker host

## Quick Start

```bash
git clone https://github.com/YOUR_USERNAME/claude-max-proxy.git
cd claude-max-proxy
npm install

# Authenticate with your Claude Max subscription
claude setup-token

# Configure
cp .env.example .env
# Edit .env — set API_KEY to any secret string

# Run
npm run dev
```

### Test

```bash
curl http://localhost:3456/v1/chat/completions \
  -H "Authorization: Bearer your-secret-key-here" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "sonnet",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

## Using with Tools

**Cursor** — Settings → Models → OpenAI API Base: `http://localhost:3456/v1`

**Continue** — `~/.continue/config.json`:
```json
{
  "models": [{
    "title": "Claude (Max)",
    "provider": "openai",
    "model": "sonnet",
    "apiBase": "http://localhost:3456/v1",
    "apiKey": "your-secret-key-here"
  }]
}
```

**Open WebUI** — Settings → Connections → OpenAI API: `http://localhost:3456/v1`

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `API_KEY` | *(empty)* | Bearer token for API auth. Empty = no auth |
| `PORT` | `3456` | Server port |
| `MAX_CONCURRENT_REQUESTS` | `3` | Max parallel SDK queries |
| `MAX_BUDGET_PER_REQUEST` | `0.50` | USD budget cap per request |
| `REQUEST_TIMEOUT_MS` | `300000` | 5 minute request timeout |
| `SESSION_TTL_HOURS` | `24` | Session expiry for multi-turn |
| `DB_PATH` | `./data/analytics.db` | SQLite database path |

## Dashboard

Set up Google OAuth credentials in `.env`:

```env
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
ALLOWED_EMAILS=you@gmail.com
JWT_SECRET=random-secret-string
PUBLIC_URL=http://localhost:3456
```

Then visit `http://localhost:3456/dashboard`.

## Docker

```bash
docker compose up --build
```

The compose file mounts `~/.claude` (read-only) for credentials and a volume for SQLite. Run `claude setup-token` on the host first.

## OpenAI Compatibility

| Parameter | Support |
|-----------|---------|
| `model` | Passed through to SDK as-is |
| `messages` | system, user, assistant, tool, developer |
| `stream` | Full SSE support |
| `tools` / `tool_choice` | Function calling via MCP bridge |
| `response_format` | `json_object` and `json_schema` |
| `reasoning_effort` | Mapped to SDK effort |
| `stream_options.include_usage` | Supported |
| `max_tokens` | Not supported (SDK limitation) |

## Known Limitations

- `max_tokens` / `max_completion_tokens` not supported (Agent SDK limitation)
- `n > 1` not supported (single completion per request)
- Extended thinking + streaming not available simultaneously (SDK limitation)

## License

MIT — see [LICENSE](LICENSE).
