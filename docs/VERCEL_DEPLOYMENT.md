# Vercel frontend and standalone backend

Production frontend target: https://mission-health-bug-busters.vercel.app/

The Vercel project is `mission-health` in the `acme-2c0d` team and is connected to `denzasikora-lab/mission-health`. Its frontend build is `npm run build:vercel`, using Node.js 24. `vercel-static/` contains only public assets. The build adds the standalone session bootstrap before application scripts; it does not modify the Sites HTML source.

## Topology

- Vercel serves the frontend and rewrites `/api/*` to the existing HTTPS origin at `app.fereyappfuturewinterworkbookgrace.store/mission-health-api/api/*`.
- The existing Nginx HTTPS server on t4 proxies that dedicated prefix to `127.0.0.1:8092` and sets Host to `mission-health-bug-busters.vercel.app`.
- `server/standalone.mjs` adapts the existing Worker routes to Node.js. It keeps the same input validation, deterministic rules, primary Azure provider, and utility provider.
- SQLite and recording/object files are private under `/home/t4/mission-health/backend/data`. They are separate from the GPT site's D1/R2 storage. Existing personal records are not copied to a public deployment.
- The API uses the existing t4 memory service at `127.0.0.1:8091`. Qdrant and the text embedder stay on loopback; the browser does not receive their keys or connect to their ports.
- Existing VPN services and other applications on the server are outside this deployment.

The GPT site's runtime and audience remain independent. Its authenticated Sites identity is not reused as an anonymous Vercel identity.

## Sessions and limits

On the standalone deployment, `/api/session` creates a signed guest session in a Secure, HttpOnly, SameSite cookie. The frontend waits for that bootstrap before making other API requests. Each browser session receives a separate owner scope. Incoming `oai-*` identity headers are discarded; `LOCAL_PREVIEW` is forbidden on the standalone server. Changing the display name does not grant access to another visitor's records.

The session cookie is the access mechanism for that browser's records. It is not an account with cross-device recovery. Clearing it starts a new guest session. The initial deployment contains prototype/sample material and no migrated personal health history.

The adapter validates the exact production Origin and Host, bounds request bodies/concurrency, and enforces persistent model-call quotas. Default model limits are 20 calls per session per UTC day, 100 calls globally per UTC day, and two concurrent upstream calls. Retries and utility generation also consume quota. These are request limits, not a guaranteed monetary spending cap. Service-unavailable or quota results must not be presented as successful analysis.

Private object storage has a default global ceiling of 1 GiB, independently of the per-file limit. Replacements and deletions release their previous allocation, and the storage ceiling remains enforced after a restart.

## Builds

Environment: macOS or another Unix-like development shell, repository root, Node.js 24.

```bash
npm ci
```

```bash
npm run build:vercel
```

```bash
npm run build:backend
```

The backend output is `dist/backend/worker.mjs`. It uses the same ordered Worker source list as the GPT-site build, without embedding the public asset bundle. Deploy it together with `server/` and `drizzle/`; it has no Node package dependencies.

```bash
node --test tests/*.test.mjs
```

## Server settings

Private runtime settings belong in `/home/t4/mission-health/backend/runtime.env`, mode 600. They must not be committed, copied into `vercel-static/`, or placed in browser environment variables.

| Setting | Purpose |
| --- | --- |
| `PUBLIC_ORIGIN` | Exact HTTPS production Vercel origin |
| `SESSION_SECRET_FILE` | Private stable signing secret outside the release |
| `DATA_DIR` | Persistent private data outside the release |
| `WORKER_MODULE` | Built Worker module for the selected release |
| `MIGRATIONS_DIR` | The release's SQL migrations |
| `API_HOST`, `API_PORT` | Loopback listener, `127.0.0.1:8092` |
| `MAX_OBJECT_STORAGE_BYTES` | Global private object-byte ceiling, default 1 GiB |
| `LLM_PROVIDER` | `azure_responses` for the primary NASA-AI agent |
| `AZURE_AGENT_ENDPOINT`, `AZURE_AGENT_API_KEY` | Existing upstream agent and its server-side secret |
| `LLM_BASE_URL`, `LLM_MODEL`, `LLM_API_KEY` | Separately configured utility provider |
| `MEMORY_URL`, `MEMORY_API_KEY` | Existing private t4 memory service |

`deploy/t4/configure_backend.mjs` accepts the Azure credential through hidden stdin and transfers only the named project configuration to t4. It reuses the existing ignored project utility configuration and the server's private memory key. It prints key names, not secret values.

The backend installer and HTTPS activation are separate steps. The API service can be checked on loopback before Nginx changes. Adding the dedicated route to the existing system Nginx configuration requires an administrator on t4; it does not require changing another application's upstream or restarting the VPN.

## Acceptance evidence

A complete release requires all of the following:

1. The recorded Git commit passes the suite and both builds.
2. The API's loopback readiness succeeds and its session/data survive a service restart.
3. Vercel reports a successful production deployment for that source.
4. HTTPS `/api/session` sets the private cookie; `/api/me`, task CRUD, and archive isolation work through the Vercel URL.
5. A synthetic agent request identifies the actual configured backend. No real health records are required for this test.

A reserved domain or a successful static page alone is not evidence of a working backend. Keep the final deployment receipt with the actual verified commit and test results.
