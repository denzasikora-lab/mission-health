# Team handoff

Mission Health / Bug Busters / NASA Space Apps.

## Shared project

- Code: https://github.com/denzasikora-lab/mission-health
- Hosted application: https://mission-health-orbit-2026.crownbobbytron.chatgpt.site/
- API contract: [API.md](API.md)
- Importable requests: [mission-health.postman_collection.json](mission-health.postman_collection.json)
- Development and pull requests: [CONTRIBUTING.md](../CONTRIBUTING.md)

The repository is private. Give the owner your exact GitHub username and accept the invitation. Use your own account, a feature branch, and a pull request into `main`. Source access, hosted-site access, and upstream Azure credentials are separate permissions. A repository link alone does not grant any of them.

## What is already implemented

| Task | Application endpoint |
| --- | --- |
| Verify local services and identity | `GET /api/status`, `GET /api/me` |
| Chat with NasaGPT | `POST /api/chat` |
| Structured readings analysis | `POST /api/health-analysis` |
| Read the latest or a specific analysis | `GET /api/health-analysis`, `GET /api/health-analysis/{id}` |
| Save and read diary notes | `POST`, `GET /api/astronauts/personal/messages` |
| Upload private chat attachments | `POST /api/chat-files` |
| Upload audio/video for analysis | `POST /api/media-analysis` |
| Manage scheduled work | `GET`, `POST /api/tasks`; `PATCH`, `DELETE /api/tasks/{id}` |
| Shared astronaut conversation | `GET`, `POST /api/team-chat` |

These are real application routes, not proposed paths. See API.md for all routes, input limits, ownership, status rules, and failure behavior.

The browser calls this application's `/api/` endpoints. The Worker then calls Hanzala's Azure **NASA-AI Responses agent** using a server-side secret. Chat, diary replies, recording summaries, and readings analysis use that primary provider. Utility features use their separate configured provider. Hammad can work on frontend/API wiring in the same repository while Hanzala maintains the upstream agent.

Do not put the Azure key in frontend code or send it as an authentication key to this application's routes. The hosted API uses an authenticated Sites browser session; it is not an anonymous API or a separately provisioned bearer-token service. Test external scripts against the local development server. A new server-to-server integration needs an explicit authentication contract rather than forged identity headers, public access, or relaxed CORS checks.

## Run a checkout

Environment: macOS or another Unix-like development shell. Start in the parent directory where you keep project checkouts. Use Node.js 24; Node.js 24.14.0 has been verified.

```bash
git clone https://github.com/denzasikora-lab/mission-health.git
cd mission-health
```

All following commands run from the `mission-health` repository root.

```bash
npm ci
```

If `.dev.vars` does not exist, copy `.dev.vars.example` to `.dev.vars`. Do not overwrite an existing developer configuration. For offline interface and storage checks, put `AIR_GAP=1` in that ignored file. Rules and storage still work; an unavailable AI response is expected.

To test Hanzala's agent, use these local runtime setting names and obtain the actual key privately:

```dotenv
LLM_PROVIDER=azure_responses
AZURE_AGENT_ENDPOINT=https://AstronautHealthAI.services.ai.azure.com/api/projects/AstronautHealthAI/agents/NASA-AI/endpoint/protocols/openai/responses?api-version=v1
AZURE_AGENT_API_KEY=<set privately in .dev.vars>
```

Remove `AIR_GAP=1` only when intentionally testing that configured service. The resource root alone is not an agent invocation URL. No `model` value is required for the dedicated agent endpoint.

```bash
npm run build
```

```bash
node_modules/.bin/wrangler d1 migrations apply DB --local --config wrangler.jsonc --persist-to .wrangler/state
```

```bash
npm run dev
```

Open http://localhost:8765. Local D1/R2 data and the development identity are separate from the hosted owner account. Stop the development server with Ctrl+C after testing. Optional model downloads, Qdrant, and the Python memory service are not required for a frontend/API wiring task.

## Import and test the requests

Import `docs/mission-health.postman_collection.json` into Postman. Keep `baseUrl` at `http://localhost:8765` for local checks and select `language` as `en` or `ur`. The collection includes synthetic examples and dynamic IDs/times; select local files only for requests that explicitly require an upload. It does not contain real credentials or a production identity header.

Start with status and identity, then a diary note or task CRUD. Model-backed requests require a configured upstream service. Saving data and successful AI analysis are distinct: inspect `replyError`, `result.agentAvailable`, `pending`, and returned status. HTTP 202 means the original analysis is still in progress; reuse its ID. A changed payload with an existing ID can return HTTP 409. Never replace an unavailable model or missing sensor with an invented successful result.

The Health prototype preserves skin/body-temperature separation and self-report provenance. Its illustrative rules establish a minimum severity the agent cannot lower. English and Urdu remain supported; Russian is not offered. Generated hashtags and JSON status codes remain English.

## Review and release

```bash
node --test tests/*.test.mjs
```

Run relevant interface checks, build the final source, and open a focused pull request. Include request/response examples with synthetic data and the actual validation results. Coordinate generated `dist/` changes and migrations with the owner. Do not commit `.dev.vars`, keys, uploaded recordings, databases, or model weights.

The GPT site uses a Cloudflare Worker, D1, R2, and Sites authentication. The separate Vercel frontend uses a Node.js adapter on t4 with private SQLite/object storage and signed guest browser sessions. See [VERCEL_DEPLOYMENT.md](VERCEL_DEPLOYMENT.md). Its storage is separate; existing GPT-site records are not migrated. Merging code does not itself publish the GPT site or update the VPS backend; the owner releases the exact verified commit while preserving the existing audience.
