# Team handoff

Mission Health / Bug Busters / NASA Space Apps.

## Shared project

- Code: https://github.com/denzasikora-lab/mission-health
- GPT site with its separate audience: https://mission-health-orbit-2026.crownbobbytron.chatgpt.site/
- Vercel frontend target: https://mission-health-bug-busters.vercel.app/
- API contract: [API.md](API.md)
- Importable requests: [mission-health.postman_collection.json](mission-health.postman_collection.json)
- Development and pull requests: [CONTRIBUTING.md](../CONTRIBUTING.md)

The repository is public. Anyone can read the source or propose a fork/pull request. Direct collaborators still need an invitation. Use your own account, a feature branch, and a pull request into `main`. Source access, hosted-site access, and upstream Azure credentials are separate permissions.

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

Do not put the Azure key in frontend code or send it as an authentication key to this application's routes. The GPT-site API uses an authenticated Sites browser session. The separate Vercel deployment uses signed guest browser sessions with private owner scopes; it does not offer a separately provisioned server-to-server bearer token. Test external scripts against the local development server. A new server-to-server integration needs an explicit authentication contract rather than forged identity headers or relaxed CORS checks.

## Request flow and interface triggers

The active frontend is Vercel. Its `/api/*` rewrite reaches Nginx on t213, then the Node.js 24 API at loopback port 8092. This is a Node HTTP adapter running the application's Worker-compatible handlers, not Express or FastAPI. The Python FastAPI memory service and the native Qdrant process are on t4. The Node API reaches memory through the private t213-to-t4 tunnel. Browsers use the Vercel origin and its signed session cookie.

The primary language provider is Hanzala's Azure agent. The separate ProxyAPI utility provider uses `https://api.proxyapi.ru/v1` with `openai/gpt-5-mini`. It handles draft completions, story hashtags and legacy Cyrillic-to-English display translation. Cloud transcription separately uses `openai/whisper-1`; a text mini model does not replace a speech recognizer. ProxyAPI is not an automatic failover for the primary Azure agent. The Azure resource key authenticates calls to the configured agent endpoint; neither the key nor `NASA-AI` in its URL identifies the agent's underlying model.

There are 20 application POST route patterns in the current API. Five may invoke the Azure language agent; not every POST invokes a model, and not every POST has a separate visible button.

| POST route | Interface trigger | Processing |
| --- | --- | --- |
| `/api/chat` | Send in the NasaGPT tab; retry an unanswered message | Azure conversation with a frozen snapshot of current personal readings |
| `/api/health-analysis` | Analyze in Health; Retry analysis | Deterministic rules, Azure explanation, saved structured result |
| `/api/media-analysis` | Automatic processing after stopping Audio or Camera recording; retry processing | Save media, transcribe when needed, analyze with Azure, save archive result |
| `/api/astronauts/{profile}/messages` | Save in the archive entry editor; retained diary Ask/Send flow | `mode: "note"` saves only; `mode: "ask"` retrieves diary context and asks Azure |
| `/api/astronauts/{profile}/book-answer` | Archive -> Search archive -> Find; automatic when the search returns owned entries | Azure answer grounded in the selected retrieved entries, shown above the matched pages |
| `/api/compose` | Debounced typing in a supported text editor | ProxyAPI mini draft continuation |
| `/api/story-tags` | Debounced story-caption editing | ProxyAPI mini English topical hashtags with local fallback |
| `/api/transcriptions` | Cloud speech recognition from recording/dictation flows | Configured speech service; ProxyAPI Whisper when selected |
| `/api/readings` | Save readings or Save imported readings in Health | Persist manual/imported values and index their factual archive note |
| `/api/team-chat` | Send in Group chat | Store a shared astronaut message; no AI reply |
| `/api/tasks` | Save a new task in Scheduled | Store a task; chat-based task extraction also happens inside `/api/chat` |
| `/api/activity` | Automatic navigation, committed check-in and other supported actions | Store an activity event |
| `/api/astronauts/{profile}/book-search` | Submit an Archive search | Qdrant retrieval through the text embedder; browser-vector fallback if needed |
| `/api/astronauts/{profile}/book-vectors` | Automatic indexing during browser-vector search fallback | Store validated browser text vectors |
| `/api/astronauts/{profile}/photos` | Save material in the retained photo/video comparison flow | Store comparison material; no language-agent call by this route |
| `/api/stories` | Publish a captured story | Store the story and its supplied media |
| `/api/chat-files` | Select a file with the chat paperclip | Store a private or shared chat attachment |
| `/api/actiwatch` | Confirm a validated Actiwatch CSV import | Persist owned recorded epochs and their canonical summary |
| `/api/astronauts/{profile}/training` | Confirm a local training job in the fine-tuning dialog | Request the configured local training adapter |
| `/api/astronauts/{profile}/messages/{id}/reply` | Retained local assistant fallback | Save an allowed local history/comparison reply |

All 15 personal cards use one canonical model with 16 numeric channels, because blood pressure has systolic and diastolic values. Send in NasaGPT automatically attaches the current snapshot. Analyze takes the same snapshot. Every supplied channel retains value, unit, source and observation time in the agent payload's `provenance.readings`. Missing values remain null. Import IDs are resolved against the current owner's saved Actiwatch summary on the server. Recording analysis has its own audio/video inputs; sharing a text-embedding store does not make raw media available to every chat.

Health's small **FILL SAMPLE** button explicitly generates a fictional snapshot for all 15 cards. Generation is local and free of model requests. The overlay lasts only in memory; it does not overwrite saved measurements or create sensor history. Each generated value has `source: "demo"` and no observation time. Analyze and NasaGPT Send keep this provenance. The adjacent clear control restores saved readings; a new actual measurement, check-in, watch import or owner change also clears the overlay. Ordinary refreshes with unchanged data preserve it. The sample's vital-sign ranges are informed by https://www.medlineplus.gov/ency/article/002341.htm and https://www.medlineplus.gov/lab-tests/pulse-oximetry/; other channels are illustrative values, not clinical reference ranges.

The ordinary NasaGPT chat uses its conversation and attached current readings; it does not automatically retrieve the personal diary. The diary Ask flow retrieves previous entries for the selected owner/profile. Archive search uses `/book-search` followed by `/book-answer`. Their histories and purposes remain separate.

The server-side Azure call has this shape (pseudocode):

```js
fetch(process.env.AZURE_AGENT_ENDPOINT, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "api-key": process.env.AZURE_AGENT_API_KEY
  },
  body: JSON.stringify({
    input: [
      {type: "message", role: "system", content: instructionsAndValidatedContext},
      {type: "message", role: "user", content: userQuestion}
    ],
    max_output_tokens: 1536,
    stream: false,
    store: false
  })
});
```

The dedicated agent selects its deployed model, so this request has no `model` field. The adapter accepts a completed response and reads assistant `output_text` items. Health Analyze requests a JSON object with `status`, `alerts` and `summary`; ordinary NasaGPT requests a conversational text answer. The application validates health output and preserves its deterministic severity floor.

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

The GPT site uses a Cloudflare Worker, D1, R2, and Sites authentication. The separate Vercel frontend targets the Node.js API on t213 through `https://users.fereyuserstopstrongcloudwinter.shop/mission-health-api/`, with private SQLite/object storage and signed guest browser sessions. Memory and Qdrant remain on t4 loopback; the API accesses memory through a dedicated SSH tunnel at `127.0.0.1:18091` on t213. This topology uses no public memory endpoint and gives the browser no memory credentials.

See [VERCEL_DEPLOYMENT.md](VERCEL_DEPLOYMENT.md) for release acceptance. The migration preserves the standalone runtime configuration, session-signing secret, and consistent SQLite/object snapshot. `deploy/t4/configure_backend.mjs` remains a legacy t4 bootstrap; do not run it for t213. The migration is complete only after the actual HTTPS route, guest cookies, owner isolation, task CRUD, and a synthetic agent request have been verified. The storage is separate; existing GPT-site records are not migrated. Merging code does not itself publish the GPT site or update the VPS backend; the owner releases the exact verified commit while preserving the existing audience.
