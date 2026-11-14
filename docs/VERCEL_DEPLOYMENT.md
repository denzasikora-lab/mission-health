# Deployment

Website: https://mission-health-bug-busters.vercel.app/

## Where things run

- **Vercel:** frontend; connected to GitHub `main`. Build: `npm run build:vercel`, output: `vercel-static/`, Node.js 24.
- **t213:** Node.js API behind Nginx HTTPS, with private SQLite and media files. Vercel forwards `/api/*` using `vercel.json`.
- **t4:** EmbeddingGemma 2 and Qdrant. The API uses a private SSH memory tunnel; the browser receives no database/model credentials.
- **Azure:** Hanzala's NASA-AI agent. **ProxyAPI mini:** utility text features; Whisper handles cloud transcription.

## Configuration

Keep runtime settings in the server's mode-600 `runtime.env`, outside releases and Git. Preserve `DATA_DIR` and the stable `SESSION_SECRET_FILE` across releases.

Required settings: `PUBLIC_ORIGIN`, `DATA_DIR`, `SESSION_SECRET_FILE`, `WORKER_MODULE`, `MIGRATIONS_DIR`, `LLM_PROVIDER`, `AZURE_AGENT_ENDPOINT`, `AZURE_AGENT_API_KEY`. Utility and memory settings are listed in `.dev.vars.example`; never copy real keys there.

The browser uses a signed, Secure, HttpOnly session cookie created by `/api/session`. Clearing it starts a new private archive. Cross-device accounts are not implemented. Keep production origin checks and caller-identity-header rejection enabled.

Default limits: 20 model calls/session/day, 100 globally/day, two concurrent upstream calls, and 1 GiB private object storage. These are technical limits, not a monetary spending cap.

## Release

From the repository root, using Node.js 24:

```bash
node --test tests/*.test.mjs
npm run build:vercel
npm run build:backend
```

Push the verified commit to `main` for the frontend. For an API change, release `dist/backend/worker.mjs` with `server/` and `drizzle/` on t213, backing up persistent data first. Preserve secrets and unrelated services. The legacy `deploy/t4/configure_backend.mjs` must not be run on t213.

Before calling a release complete, verify Vercel deployment success, `/api/status`, profile loading, Send, recording analysis, archive/search, and isolation between two browser sessions. Keep a rollback release and record the verified commit/results.
