# Contributing to Mission Health

Mission Health is maintained by Bug Busters / NASA Space Apps. The shared repository is private:

https://github.com/denzasikora-lab/mission-health

Source-code collaboration and runtime API integration are separate tasks. GitHub access lets teammates change the project through branches and pull requests. An API contract lets the running application call another service. The current application routes and external-agent handoff requirements are described in [docs/API.md](docs/API.md).

## Get access and clone

Send the repository owner your exact GitHub username so they can invite the correct account. Accept the repository invitation and authenticate Git with that account. A private repository link by itself does not grant access. Do not make the repository public or share credentials as a substitute for adding collaborators.

Environment: macOS or another Unix-like development shell. Start from the directory where you keep project checkouts.

```bash
git clone https://github.com/denzasikora-lab/mission-health.git
cd mission-health
```

All commands below run from the cloned repository root.

## Branch and pull-request workflow

Start each task from the current `main` and create a separate branch. Use a clear task-specific name; `codex/agent-integration` is an example.

```bash
git switch main
git pull --ff-only
git switch -c codex/agent-integration
```

Coordinate ownership of shared files before making large changes. Keep a pull request focused on one feature or fix. Inspect `git status` and `git diff`, then stage only the intended files and commit them with an English message. Push the branch:

```bash
git push -u origin codex/agent-integration
```

Open a pull request into `main`. Explain the problem, resulting behavior, configuration changes, and checks actually run. Include screenshots for visible interface changes and synthetic request/response examples for API changes. Ask another teammate to review before merging. Avoid force-pushing shared `main` or overwriting unrelated work.

Publishing the GPT site is separate from merging source code. Coordinate releases with the owner and publish the exact verified commit with its matching build archive. Changing repository access does not grant Sites hosting access.

The Vercel deployment target uses a separate standalone backend on t213. Text memory, the embedder, and Qdrant remain on t4; a dedicated SSH tunnel exposes memory only on t213 loopback port 18091. The migration preserves standalone data and the session-signing secret. `deploy/t4/configure_backend.mjs` is a legacy t4 bootstrap and must not be run for t213. See [docs/VERCEL_DEPLOYMENT.md](docs/VERCEL_DEPLOYMENT.md) for the build, signed browser sessions, private storage, and release checks. Production Git deployments are enabled for the frontend; backend releases and the GPT site are separate operations. A complete release requires actual HTTPS and browser acceptance, not only a successful frontend build.

## Install and run locally

Use Node.js 24 for the built-in `node:test` and `node:sqlite` APIs required by the regression suite. The checkout has been verified with Node.js 24.14.0. The optional Python services use Python 3.12. Docker Desktop is needed only for the optional Qdrant environment.

```bash
npm ci
```

Create local settings once, if `.dev.vars` does not already exist:

```bash
cp .dev.vars.example .dev.vars
```

Edit `.dev.vars` locally to configure services you need. A missing model service must remain unavailable rather than being replaced with invented results. Do not overwrite another developer's existing settings file.

```bash
npm run build
```

```bash
node_modules/.bin/wrangler d1 migrations apply DB --local --config wrangler.jsonc --persist-to .wrangler/state
```

```bash
npm run dev
```

Open http://localhost:8765. Local preview uses a development identity and local D1/R2 state. It is not evidence that production authentication or a teammate's deployed service works. Stop the preview with Ctrl+C when finished.

The optional local memory setup is documented in [README.md](README.md). It can download large model weights and start Qdrant; do not launch it for a change that does not need it.

## Validate a change

Build the deployable Worker after source changes:

```bash
npm run build
```

Run the existing regression suite:

```bash
node --test tests/*.test.mjs
```

Run focused tests while developing, then the appropriate broader checks before handoff. Report real results; do not copy old test counts into a pull request. For interface changes, inspect relevant layouts in the browser. For API integration, test the agreed contract with synthetic data, including unavailable-service and missing-data behavior.

`package.json` has no `npm test` script. Use the explicit Node command above. Do not claim that a local test confirms a remote API is working.

## Source and generated files

- Edit browser behavior and styling under `public/`, server handlers under `worker/`, and optional local services under `local/`.
- Add schema changes through `drizzle/` migrations and coordinate them with the team.
- `dist/server/index.js` is generated by `npm run build`. Never hand-edit it.
- Review relevant generated output when preparing a release. Keep the published archive consistent with its source commit.
- Preserve dataset provenance, original units, asset credits, and third-party notices.
- Keep project documentation and examples in English. The interface supports English and Urdu; preserve both and their language-switching tests. Russian is not offered as an interface locale, and the regression suite checks for Cyrillic text in project sources.

## Secrets and private data

Keep `.dev.vars`, real API keys, authentication tokens, model weights, databases, uploaded recordings, and runtime directories out of Git. The repository's `.gitignore` excludes common local state; still inspect staged files before every commit. Use synthetic inputs in tests, screenshots, issues, and API examples. Do not put actual personal health history into fixtures or documentation.

Hosted identity headers are trusted platform inputs, not credentials teammates should forge. Keep provider calls on the server. Do not expose service keys in frontend code or relax origin/owner checks to make integration appear successful.

## Integrating a teammate's agent

Agree on the service owner and obtain the real URL, method/path, authentication, sample JSON, units, timeout, and errors before writing an adapter. See the handoff checklist in [docs/API.md](docs/API.md). The Azure NASA-AI Responses agent is already connected. Primary chat, diary replies, media summaries, and the structured readings route use the selected primary provider; utility generation keeps a separate Chat Completions provider.

Develop and test the adapter in a separate branch. Keep deterministic status rules enforceable in code, preserve missing-data states, and keep observations separate from diagnoses. No external agent endpoint should be represented as implemented or tested until its actual service has been exercised and the result recorded.

## Ready-to-import API requests

Start with [TEAM_HANDOFF.md](docs/TEAM_HANDOFF.md), then import [mission-health.postman_collection.json](docs/mission-health.postman_collection.json). Its default base URL is the local preview. API documentation and GitHub access do not create a public production API token or grant access to another owner's data.
