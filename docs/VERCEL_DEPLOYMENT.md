# Vercel frontend and standalone backend

Production frontend target: https://mission-health-bug-busters.vercel.app/

The Vercel project is `mission-health` in the `acme-2c0d` team and is connected to `denzasikora-lab/mission-health`. Its frontend build is `npm run build:vercel`, using Node.js 24. `vercel-static/` contains only public assets. The build adds the standalone session bootstrap before application scripts; it does not modify the Sites HTML source.

## Topology

The backend migration targets the topology below. It is not complete until the HTTPS and browser acceptance checks in this document have passed for the deployed release.

- Vercel serves the frontend and rewrites `/api/*` to `https://users.fereyuserstopstrongcloudwinter.shop/mission-health-api/api/*` on t213.
- The existing Nginx HTTPS server on t213 uses `/etc/nginx/sites-enabled/users` and proxies that dedicated prefix to `127.0.0.1:8092`. It sets Host to `mission-health-bug-busters.vercel.app` and preserves the other applications and TLS configuration.
- `server/standalone.mjs` adapts the existing Worker routes to Node.js. It keeps the same input validation, deterministic rules, primary Azure provider, and utility provider.
- SQLite and recording/object files are private under `/home/t213/mission-health/backend/data`. They are separate from the GPT site's D1/R2 storage. Existing GPT-site personal records are not copied to this deployment.
- The text memory service and embedder remain on t4 at `127.0.0.1:8091`; Qdrant remains on t4 loopback at port 6333. A dedicated SSH tunnel exposes the memory service only at `127.0.0.1:18091` on t213 and forwards it to t4 loopback port 8091. The API uses `MEMORY_URL=http://127.0.0.1:18091` with its private memory credential.
- This topology uses no public memory endpoint. The browser receives neither memory credentials nor direct access to the tunnel, embedder, or Qdrant ports.
- Existing VPN services and other applications on both servers are outside this deployment.

The GPT site's runtime and audience remain independent. Its authenticated Sites identity is not reused as an anonymous Vercel identity.

## Sessions and limits

On the standalone deployment, `/api/session` creates a signed guest session in a Secure, HttpOnly, SameSite cookie. The frontend waits for that bootstrap before making other API requests. Each browser session receives a separate owner scope. Incoming `oai-*` identity headers are discarded; `LOCAL_PREVIEW` is forbidden on the standalone server. Changing the display name does not grant access to another visitor's records.

The session cookie is the access mechanism for that browser's records. It is not an account with cross-device recovery. Clearing it starts a new guest session. The t4-to-t213 migration preserves the standalone session-signing secret and saved state; no GPT-site personal health history is migrated.

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

Private runtime settings belong in `/home/t213/mission-health/backend/runtime.env`, mode 600. They must not be committed, copied into `vercel-static/`, or placed in browser environment variables.

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
| `MEMORY_URL` | `http://127.0.0.1:18091`, the dedicated t213-to-t4 loopback tunnel |
| `MEMORY_API_KEY` | Private credential for the existing t4 memory service |

The `deploy/t4/` directory name is retained for compatibility; the selected API host for this topology is t213. `deploy/t4/configure_backend.mjs` is a legacy t4 bootstrap with hardcoded t4 paths. Do not run it for t213 or use it to recreate the migrated configuration.

The migration preserves the existing mode-600 `runtime.env`, session-signing secret, and a consistent SQLite/object snapshot through an encrypted transfer. Keep upstream keys and the signing secret unchanged. Update only the four host-specific path settings (`SESSION_SECRET_FILE`, `DATA_DIR`, `MIGRATIONS_DIR`, and `WORKER_MODULE`) from `/home/t4/mission-health/backend` to `/home/t213/mission-health/backend`, and set `MEMORY_URL=http://127.0.0.1:18091`. Utility and memory credentials remain private runtime configuration; diagnostics must show setting names rather than secret values.

The backend installer and HTTPS activation are separate steps. Check the API on t213 loopback and the private memory tunnel before Nginx changes. The API and tunnel user services require t213's user manager to remain active after logout; `Linger=yes` has been verified separately from HTTPS activation.

`deploy/t4/activate_backend_https.py --server t213` reviews the dedicated route for `/etc/nginx/sites-enabled/users`. Its default `--server t4` preserves the previous t4 activation target for compatibility. Review the dry-run configuration hash before applying it with administrative rights on the selected server. The helper must preserve unrelated upstreams and TLS configuration and restore its own change if validation or reload fails. It does not change the VPN or enable unrelated services.

## Acceptance evidence

A complete release requires all of the following:

1. The recorded Git commit passes the suite and both builds.
2. The API's t213 loopback readiness succeeds, its session/data survive a service restart, and memory health succeeds through `127.0.0.1:18091` without publishing a memory port.
3. Vercel reports a successful production deployment for that source.
4. The selected t213 HTTPS route responds correctly. Through the Vercel URL, `/api/session` sets the private cookie; `/api/me`, task CRUD, and archive isolation work for separate browser sessions.
5. A synthetic agent request identifies the actual configured backend. No real health records are required for this test.

A reserved domain or a successful static page alone is not evidence of a working backend. Keep the final deployment receipt with the actual verified commit and test results.
