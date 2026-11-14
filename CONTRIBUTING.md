# Contributing

Public source: https://github.com/denzasikora-lab/mission-health

Fork and open a pull request, or ask the owner for a collaborator invitation using your GitHub username. Use your own account and a `codex/` feature branch. Coordinate shared files before editing.

## Run locally

Environment: macOS or another Unix-like shell, Node.js 24. Start in your projects directory:

```bash
git clone https://github.com/denzasikora-lab/mission-health.git
cd mission-health
npm ci
```

From the repository root, create local settings only if absent:

```bash
[ -e .dev.vars ] || cp .dev.vars.example .dev.vars
npm run build
node_modules/.bin/wrangler d1 migrations apply DB --local --config wrangler.jsonc --persist-to .wrangler/state
npm run dev
```

Open http://localhost:8765. Stop with Ctrl+C. Optional model/Qdrant services are unnecessary for ordinary interface edits.

## Change and verify

- Edit `public/` for the interface, `worker/` for API handlers, `server/` for the Node adapter, and `drizzle/` for migrations.
- Keep documentation/examples in English and preserve both English and Urdu interface support.
- Keep credentials, recordings, databases and model weights outside Git. Use synthetic test inputs.
- Run relevant tests, then the release checks from the repository root:

```bash
node --test tests/*.test.mjs
npm run build:vercel
npm run build:backend
```

Commit only intended files and open a focused pull request with actual check results. Merging into `main` deploys the frontend to Vercel; backend releases are separate.

See [team handoff](docs/TEAM_HANDOFF.md), [API](docs/API.md) and [deployment](docs/VERCEL_DEPLOYMENT.md).
