# Mission Health

Astronaut health research prototype by **Bug Busters / NASA Space Apps**. Mission Health combines a health dashboard, a multimedia observation diary, a searchable personal archive, and open research datasets.

Website: https://mission-health-orbit-2026.crownbobbytron.chatgpt.site/

Repository: https://github.com/denzasikora-lab/mission-health

Vercel frontend and VPS backend: [deployment guide](docs/VERCEL_DEPLOYMENT.md). The standalone deployment has separate browser sessions and storage; it does not expose the GPT site's existing personal records.

Team start: [docs/TEAM_HANDOFF.md](docs/TEAM_HANDOFF.md). Development workflow: [CONTRIBUTING.md](CONTRIBUTING.md). Integration contract: [docs/API.md](docs/API.md). Importable requests: [Postman collection](docs/mission-health.postman_collection.json).

## Application

- **Home:** NasaGPT, saved messages, scheduled tasks, and an astronaut group conversation.
- **Health:** readings, a body illustration, trends, heart rate, and a self-reported wellbeing score.
- **Diary:** video and audio capture with automatic recording, transcription, signal analysis, and visual comparisons.
- **Archive:** a page-based history containing text, recordings, transcripts, analysis results, and health snapshots. Swipe or tap either side to turn pages.
- **Research:** separate explorers for NASA OSD-575 serum biomarkers, BIDMC physiological recordings, NASA OSD-569 whole-blood measurements, and a MIT-BIH ECG preview.

The interface supports English and Urdu, light and dark themes, and adapts to narrow windows and mobile screens. Display presets include desktop, tablet, phone, and iPhone Duo. They change layout dimensions; they do not emulate physical devices.

NASA portraits and archive stories include source attribution. Jessica Meir, Jack Hathaway, and Christina Koch are real astronauts. Their profiles contain public biography and archive material, without invented medical readings. Preloaded conversations are illustrative, not statements by those astronauts. The body illustration is not a scan. Sample archive material is kept distinct from user recordings.

The current personal demo persona is **Cdr. Sara Khan (AST-014), Orion Station, Expedition 7**. Sara represents the existing personal workspace, not an added crew profile. A custom name saved by the signed-in owner takes precedence in NasaGPT; demo labels do not change account identity or imply live medical telemetry.

## Personal measurements

Health cards start without measurements. Add values through **Add or import readings**, a CSV/JSON snapshot, or an owned Actiware CSV import. Every saved value retains its unit, reported source and observation time. A reported device name is not proof of a direct hardware connection. Body and skin temperature remain separate; recovery, stress and fatigue are explicitly reported values, not inferred sensor measurements.

Cards, recorded charts, rule checks and AI input share the same personal readings. Charts never synthesize a past history or fill missing intervals. Minute view checks for new saved records while visible. Core readings older than 15 minutes are excluded from current rule status; a wellbeing check-in expires after 12 hours. Missing data cannot establish NORMAL status.

`POST /api/readings` saves an immutable measurement snapshot and a factual archive note. The text embedder indexes that note in owner-scoped Qdrant memory for archive search and cited answers. Saving measurements does not call a generative model. Camera/audio panels remain empty until an actual recording or saved result is available; reference archive samples stay explicitly labeled.

## Research data

Each study retains its own participants, units, and time axis. Records are never joined across people or studies.

| Source | Included material | Purpose |
| --- | --- | --- |
| NASA OSD-575 | 4 participants, 28 serum samples, 13 biomarkers, 364 values | Compare preflight and postflight measurements within a participant |
| BIDMC | Recorded vital signs and original waveform excerpts | Replay ground clinical recordings and inspect transparent deviation rules |
| NASA OSD-569 | Prepared whole-blood measurement explorer with provenance | Explore a separate Inspiration4 assay |
| MIT-BIH Arrhythmia Database | ECG waveform preview and beat annotations | Illustrate ground ECG signal review |

The OSD-575 CSV is available at `public/data/nasa-osd-575.csv`. Its values were checked against `Metabolic_Panel.csv` and `Serum_Cardiovascular.csv` from the referenced public repository. These small research cohorts do not establish diagnostic accuracy or validate a predictive health model.

BIDMC reference bands use the median of the first 60 seconds with at least 30 valid readings. The half-width is `max(4 * 1.4826 * MAD, floor)`, with floors of 10 bpm for heart rate/pulse, 5 breaths/min for respiration, and 3 percentage points for SpO2. A deviation must persist for at least 5 seconds. Missing, zero, and nonfinite readings are excluded; SpO2 above 100% is excluded too. This is a demonstration rule, not a clinically validated threshold.

## Architecture

- **Browser:** JavaScript, HTML, CSS, Canvas, Web Audio, MediaRecorder, and local visual processing.
- **Server:** a Cloudflare Worker built into `dist/server/index.js`.
- **D1:** user-scoped diary messages, metadata, tasks, activity, and vectors.
- **R2:** private media objects with owner-scoped access.
- **Optional local services:** Python, Qdrant, text embeddings, and a local assistant.

`GET /api/me` provides the authenticated identity. User data is scoped to the authenticated owner and selected profile. Locally entered names are display labels, not authentication credentials. Private media responses are not cached; video supports byte ranges. Retrying an upload with the same identifier and content does not create another copy.

## Recording and analysis

Camera and microphone access starts through an explicit user action. Closing a recording view, cancelling access, hiding the browser tab, or reaching a recording limit stops the relevant devices. A delayed permission response must not reactivate a closed capture session.

The video diary composites the camera with a selected background. MediaPipe segmentation and facial comparison run on the device. Audio analysis computes observable signal properties such as average level, quiet intervals, and clipping. Whisper-compatible transcription uses the configured speech service. Voice-description embedding similarity is not an emotion probability or a clinical score.

Visual observations share one group, including facial geometry, apparent age, and skin/pigmentation comparisons. Apparent age is an experimental appearance estimate. Lighting, expression, distance, and sleep can affect the result. Skin comparisons require consistent framing and scale; they cannot diagnose or rule out a dangerous lesion. User-facing results retain these limitations.

Uploaded video comparisons use selected frames. Frame similarity helps retrieve earlier material; it does not measure pulse, respiration, or gait. Original recordings and derived results remain separate in the archive. Sample results must not be presented as measurements of the current user.

Older Cyrillic records are displayed through an owner-scoped English translation cache. Original records remain unchanged; existing Urdu and English text is preserved. Translation uses the configured utility language service; if unavailable, an English status message is shown instead of untranslated Cyrillic text.

## Personal memory and assistant

Diary messages are saved before indexing. An unavailable embedding service leaves the original record available for a later indexing attempt. Text memory can use local embeddings with Qdrant. Retrieved results are checked against the authenticated user's D1 records before inclusion in an answer.

The configured language service receives the selected history and supporting material. When semantic memory is unavailable, the server can use saved history and bounded keyword retrieval. If a language service cannot answer, the interface can show original records with dates; that fallback is identified as retrieved evidence.

Scheduled tasks can be created from explicit dates and times in chat, then edited, completed, or deleted in **Scheduled**. Wellbeing scores use an explicit scale; older 1-10 scores are normalized to 1-100 without changing their meaning.

## Hosted text memory

The Linux CPU service uses Qdrant and the text encoder of the pinned EmbeddingGemma 2 snapshot. Hosted mode requires an explicit bearer key, verifies the exported model manifest, and never loads Qwen. The CPU dependency set includes torchvision because the model processor imports it even with the image encoder disabled.

Deployment files are in `deploy/t4/`. The t4 layout is `/home/t4/mission-health`, with separate user services `mission-health-qdrant.service` and `mission-health-memory.service`. Qdrant binds to loopback with a private API key and a 1 GiB memory ceiling. The embedder uses two CPU threads, one worker, and a 3 GiB ceiling. Existing VPN services are separate.

Export the text artifact with `local/export_text_model.py`, install `local/requirements-cpu.txt` in the server venv, and verify the artifact before starting the service. Both installation scripts support a dry run and refuse to overwrite an existing deployment. Runtime credentials stay in the server's private `runtime/` directory, outside Git.

`deploy/t4/activate_https.py` adds one authenticated memory proxy prefix to the existing app HTTPS server. First review its dry-run SHA256. Administrative activation requires that same hash, preserves the original app routes and TLS, validates Nginx, and restores the backup if validation or reload fails. Concurrent changes are rejected. Configure hosted `MEMORY_URL` and secret `MEMORY_API_KEY` only after verifying the HTTPS endpoint. Migration 0015 queues existing diary entries for reindexing without changing their text, scores, media, or browser vectors.

Primary chat, diary answers, and media summaries can use the Azure Responses agent through `LLM_PROVIDER=azure_responses`, `AZURE_AGENT_ENDPOINT`, and secret `AZURE_AGENT_API_KEY`. Existing `LLM_*` Chat Completions settings remain available for utility features with strict output formats. Audio/video embeddings and local visual comparisons still run in the browser; moving text memory does not move those workloads.

## Local development

Requirements: Node.js, Python 3.12, and Docker Desktop for the optional Qdrant service. Run commands from the project directory.

```bash
npm ci
cp .dev.vars.example .dev.vars
npm run build
node --test tests/*.test.mjs
```

Configure service credentials in `.dev.vars`. Never commit real keys. The example declares `LLM_BASE_URL`, `LLM_MODEL`, `LLM_API_KEY`, and `MEMORY_API_KEY`; adapters may need additional configuration documented in their source.

Start the complete optional local memory environment:

```bash
python3.12 -m venv .venv
.venv/bin/python -m pip install -r local/requirements.txt
.venv/bin/python local/download_models.py
bash local/start.sh
```

Open http://localhost:8765. The local memory service uses port 8091 and Qdrant uses port 6333. Model downloads can be large. Local databases, models, credentials, and runtime directories are excluded from Git.

Press Ctrl+C in the startup terminal to stop the interface and its local memory process. Stop the Qdrant container separately when no longer needed:

```bash
docker stop mission-health-qdrant
```

To use the interface without the optional memory startup script, apply local D1 migrations and start Wrangler:

```bash
node_modules/.bin/wrangler d1 migrations apply DB --local --config wrangler.jsonc --persist-to .wrangler/state
npm run dev
```

## Project layout

| Directory | Contents |
| --- | --- |
| `public/` | Interface, browser analysis, research data, and attributed assets |
| `worker/` | Authenticated API handlers and server-side adapters |
| `local/` | Optional local memory, speech, and training services |
| `drizzle/` | D1 schema migrations |
| `scripts/` | Build and research import utilities |
| `tests/` | API, parsing, capture lifecycle, navigation, and interface regression checks |
| `.openai/hosting.json` | Existing Sites project identity and storage bindings |
| `dist/` | Generated deployable Worker and assets |

Run `npm run build` after changing source files. The build bundles public assets and the Worker; do not edit the generated server directly. Sites publication must use the verified source commit and its matching build archive.

## Sources and attribution

- NASA Open Science Data Repository: https://osdr.nasa.gov/
- NASA Human Research Program: https://www.nasa.gov/hrp/
- NASA Image and Video Library: https://images.nasa.gov/
- PhysioNet BIDMC PPG and Respiration Dataset: https://physionet.org/content/bidmc/1.0.0/
- PhysioNet MIT-BIH Arrhythmia Database: https://physionet.org/content/mitdb/1.0.0/
- NASA Space Apps Challenge: https://www.spaceappschallenge.org/

Dataset-specific provenance and asset credits are stored alongside the corresponding files under `public/data/` and `public/assets/`. Third-party notices and licenses remain with their assets. This independent research prototype is not endorsed by NASA and does not provide clinical decision support.
