# Mission Health API and agent integration

This document describes the API implemented in `worker/` and the supported server-side provider configuration. Runtime settings select the active provider; model connectivity is separate from clinical validity.

## Two separate integration surfaces

1. **Application API:** the browser calls the same-origin `/api/` routes below. These manage identity, chat, diary, recordings, tasks, and research-related imports.
2. **Language-service adapter:** the Worker supports Chat Completions and the Azure agent Responses protocol. The selected primary provider serves chat, diary answers, and recording analysis. Utility generation keeps its separate Chat Completions contract.

A teammate's health-analysis agent is an upstream service. Its supplied Azure deployment was tested successfully and has a Responses adapter; see the external-agent section below. The structured prototype readings workflow is available separately from ordinary diary/chat replies; both use the same primary provider.

## Environments and authentication

| Environment | Base URL | Identity |
| --- | --- | --- |
| Local development | `http://localhost:8765` | `LOCAL_PREVIEW=1` in `wrangler.jsonc` selects the `local-preview` owner |
| Hosted site | `https://mission-health-orbit-2026.crownbobbytron.chatgpt.site` | Sites authenticates the visitor and injects the trusted `oai-authenticated-user-id` header |

The production API is not a public anonymous REST service. Use the hosted site through its authenticated browser session. A caller-supplied identity header is not a supported production authentication method. Do not spoof it, expose a bypass token, or add `LOCAL_PREVIEW=1` to production.

English is the default interface language, and Urdu (`ur`, `ur-PK`, right-to-left) is supported. `x-mission-language: ur` selects Urdu prose for chat, health analysis, and media analysis; absent or unsupported values fall back to English. Diary entries also accept `language: "ur"` and retain that saved language. API field names, status codes, numerical units, and generated hashtags remain canonical English. Russian is not offered as a locale. Stored Urdu and English entries are preserved; the historical Cyrillic display filter does not translate or remove Urdu.

JSON mutation requests use `Content-Type: application/json`. File and recording uploads use `multipart/form-data`. Non-GET requests with a foreign `Origin` or `Sec-Fetch-Site: cross-site` are rejected. The Worker does not offer a general cross-origin API integration contract. A teammate's external service should be called from a server-side adapter, with its credentials kept on the server.

Personal diary, media, tasks, and favorites are scoped to the signed-in owner. Group-chat messages form a shared channel for site participants; an attachment becomes shared only after it is explicitly posted there. A display name is not an authorization identity.

## Main routes

`{profile}` is one of `personal`, `jessica-meir`, `jack-hathaway`, or `christina-koch`. Profile IDs select separate prototype histories; they do not identify real astronauts' medical records.

The current personal demo persona is **Cdr. Sara Khan**, astronaut label **AST-014**, **Orion Station**, **Expedition 7**. This remains the `personal` profile, not an additional crew member or a `sara-khan` API profile. `GET /api/me` returns this default name unless the owner has saved a custom name. Its additive `astronautId`, `station`, `expedition`, and `isDemo: true` fields describe the demo persona; they do not change authentication, account-scoped `storageScope`, or the generated `researcherId`, and do not imply verified telemetry.

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/api/status` | Report configured assistant, history, photo, and semantic-memory capabilities |
| GET | `/api/health-analysis` | Read the owner's latest prototype readings analysis |
| GET | `/api/health-analysis/{id}` | Read one owned saved analysis |
| POST | `/api/health-analysis` | Validate a snapshot, calculate prototype rules, and ask the primary agent |
| GET | `/api/me` | Return `name`, `researcherId`, account-scoped `storageScope`, and the personal demo persona metadata |
| PUT | `/api/me` | Save a display name using exactly `{"name":"..."}`; optional `x-mission-profile-scope` prevents stale-account writes |
| GET | `/api/location` | Return the request's available country code or `null` |
| GET | `/api/chat` | Read the owner's NasaGPT conversation |
| POST | `/api/chat` | Save a message, request a conversational reply, and extract explicit scheduled tasks |
| GET | `/api/team-chat` | Read the shared astronaut conversation |
| POST | `/api/team-chat` | Post a message to that shared conversation without invoking the assistant |
| GET | `/api/astronauts/{profile}/messages` | Read a profile's diary and assistant replies |
| POST | `/api/astronauts/{profile}/messages` | Save a diary entry or ask the diary assistant |
| GET | `/api/astronauts/{profile}/search?q=...` | Retrieve matching diary entries |
| GET | `/api/tasks` | List up to 200 non-cancelled tasks for the owner |
| POST | `/api/tasks` | Create a manual task |
| PATCH | `/api/tasks/{id}` | Edit title, date, time zone, time, or status |
| DELETE | `/api/tasks/{id}` | Mark a task `cancelled`; restore using PATCH with `status: "planned"` |
| GET | `/api/favorites` | List the owner's saved entries and replies |
| PUT | `/api/favorites` | Bookmark a canonical diary/chat source using `sourceType`, `sourceId`, and a diary `profile` when applicable |
| DELETE | `/api/favorites/{id}` | Remove a bookmark without deleting the original entry |
| GET | `/api/activity` | Read the owner's recent activity |
| POST | `/api/activity` | Record a validated interface action |
| GET | `/api/media-analysis` | Read the latest usable saved audio and video analysis results |
| POST | `/api/media-analysis` | Upload a recording, transcribe/analyze it, and save its results |
| GET, HEAD | `/api/media-analysis/{id}/media` | Read the owner's original recording, including a single byte range |
| GET | `/api/transcriptions/config` | Report configured cloud/local speech modes |
| POST | `/api/transcriptions` | Transcribe an uploaded audio file through a configured speech service |
| POST | `/api/compose` | Suggest a continuation for an unsent draft using `{"prefix":"..."}` |
| POST | `/api/story-tags` | Suggest English hashtags using `{"caption":"..."}` |

Chat, group chat, and favorites use an optional opaque `cursor` query value returned by the preceding page. Pass it back unchanged and URL-encoded. Diary messages instead accept an optional `before` ISO timestamp. Do not infer a cursor from an array index.

### Diary request

```json
{
  "id": "12345678-1234-4234-8234-123456789abc",
  "content": "I slept for seven hours and recorded how I felt after exercise.",
  "mode": "diary",
  "language": "en",
  "attachments": [],
  "wellbeing": {"score": 80, "wellbeingScale": 100}
}
```

Use `mode: "diary"` to save a note or `mode: "ask"` to request an assistant reply. `id` is a client-generated UUID. Content is nonempty and limited to 6,000 characters. At most one existing photo/video attachment ID is accepted by this route. `wellbeing` is optional; new clients should explicitly send the 1-100 scale. It is self-reported wellbeing, not a sensor measurement.

A successful new write returns HTTP 201 with `message`, `reply`, and availability fields. Saving and analysis are distinct: `reply` can be `null` with `replyError: "assistant_unavailable"` while the original entry remains saved. Reuse the same ID and unchanged content when retrying a request whose response was lost. Changing an existing ID's owner, profile, role, content, or attachments causes a conflict.

### NasaGPT and shared-chat request

```json
{
  "id": "12345678-1234-4234-8234-123456789abc",
  "content": "Tomorrow at 10:00 I need to check the task list.",
  "attachments": [],
  "timeZone": "Europe/Istanbul",
  "wellbeing": {"score": 80, "wellbeingScale": 100}
}
```

For `/api/chat`, the response includes `message`, `reply`, `replyError`, and extracted `tasks`. For `/api/team-chat`, send `id`, `content`, and optional `attachments`; the response contains `message` and no generated assistant reply. Up to four previously uploaded files can be attached. A blank message is accepted only when valid attachments are present.

### Manual task request

```json
{
  "id": "12345678-1234-4234-8234-123456789abc",
  "title": "Check the task list",
  "dueDate": "2030-01-01",
  "dueTime": "10:00",
  "timeZone": "Europe/Istanbul"
}
```

`dueDate` is a real calendar date in `YYYY-MM-DD`. `dueTime` is optional local `HH:mm`; omit it or use `null` for an all-day task. Nonexistent local times during daylight-saving transitions are rejected. PATCH accepts any nonempty subset of `title`, `dueDate`, `dueTime`, `timeZone`, and `status`. Supported statuses are `planned`, `done`, and `cancelled`. Task responses contain `dueAt` in UTC when a time exists, plus the original local date and time zone.

### Recording request

`POST /api/media-analysis` takes multipart fields:

| Field | Contract |
| --- | --- |
| `id` | Client-generated UUID, reused unchanged for a retry |
| `kind` | `audio` or `video` |
| `file` | Actual supported media bytes, between 44 bytes and 16 MiB |
| `duration` | Finite seconds, greater than zero and no more than 125 |
| `frame` | For video, 1-3 JPEG fields, each no larger than 350,000 bytes; omitted for audio |
| `features` | Optional JSON string validated by `mediaFeatures` in `worker/media-analysis.js` |
| `transcript` | Optional text, no more than 40,000 characters |
| `wellbeing` | Optional JSON-encoded self-report |
| `createdAt` | Optional valid capture time, no more than seven days old or five minutes ahead |

Do not fabricate acoustic measurements, vectors, age ranges, or skin results to satisfy a schema. An unavailable measurement stays unavailable. A file extension alone is insufficient; the server checks media bytes. A recording is saved independently of the language service's availability. The current browser capture implementation and `tests/media-analysis-api.test.mjs` are the reference for the complete feature contract.

`POST /api/transcriptions` separately takes multipart `file` and `mode` (`api` or `local`). Its ordinary upload limit is 8 MiB. Successful responses contain `text`, `mode`, and `model`.

## Additional implemented routes

| Methods | Route | Purpose |
| --- | --- | --- |
| GET | `/api/astronauts/{profile}/book` | Read archive pages/entries |
| GET | `/api/astronauts/{profile}/book-index` | Read indexable archive material |
| POST | `/api/astronauts/{profile}/book-vectors` | Store validated text vectors |
| POST | `/api/astronauts/{profile}/book-search` | Search the archive using vectors |
| POST | `/api/astronauts/{profile}/book-answer` | Request an answer grounded in selected archive records |
| GET, POST | `/api/astronauts/{profile}/photos` | List or upload comparison material |
| GET, HEAD, PATCH, DELETE | `/api/astronauts/{profile}/photos/{id}` | Read, index, or delete owned material; GET with `compare` requests a comparison |
| GET, POST | `/api/stories` | List or publish personal stories |
| DELETE | `/api/stories/{id}` | Delete an owned story |
| GET, HEAD | `/api/stories/{id}/media` | Read story media |
| POST | `/api/chat-files` | Upload a file into `private` or `team` room scope |
| GET | `/api/chat-files/{id}` | Download an accessible attachment |
| GET, POST | `/api/actiwatch` | List or create canonical Actiwatch imports |
| GET | `/api/actiwatch/{id}` | Read the owner's canonical imported recording and metadata as JSON |
| GET, POST | `/api/astronauts/{profile}/training` | Inspect training readiness or explicitly create a local training job |
| GET, DELETE | `/api/astronauts/{profile}/training/{id}` | Inspect or cancel a job |
| GET | `/api/astronauts/{profile}/messages/{id}/context` | Read owner-scoped context for a pending local reply |
| POST | `/api/astronauts/{profile}/messages/{id}/reply` | Save a supported local reply |

These routes are implemented prototype capabilities, not a versioned third-party public API. Coordinate schema changes with the frontend and relevant regression tests.

## Local curl walkthrough

Environment: macOS or another Unix-like development shell. Working directory: the cloned `mission-health` repository root. Follow [CONTRIBUTING.md](../CONTRIBUTING.md) to install dependencies, build, apply local D1 migrations, and start `npm run dev`. These commands target the local preview only and require no production identity header.

```bash
curl --fail-with-body http://localhost:8765/api/status
```

```bash
curl --fail-with-body http://localhost:8765/api/me
```

Save a synthetic diary note without making an assistant request:

```bash
NOTE_ID=$(node -p 'crypto.randomUUID()')
curl --fail-with-body -X POST http://localhost:8765/api/astronauts/personal/messages \
  -H 'Content-Type: application/json' \
  --data "{\"id\":\"$NOTE_ID\",\"content\":\"Synthetic integration check: the diary note was saved.\",\"mode\":\"diary\",\"language\":\"en\",\"attachments\":[]}"
```

```bash
curl --fail-with-body http://localhost:8765/api/astronauts/personal/messages
```

Create a synthetic task, then edit and cancel the same ID. Replace the example date with the intended local date before use.

```bash
TASK_ID=$(node -p 'crypto.randomUUID()')
curl --fail-with-body -X POST http://localhost:8765/api/tasks \
  -H 'Content-Type: application/json' \
  --data "{\"id\":\"$TASK_ID\",\"title\":\"Synthetic integration check\",\"dueDate\":\"2030-01-01\",\"dueTime\":\"10:00\",\"timeZone\":\"Europe/Istanbul\"}"
```

```bash
curl --fail-with-body -X PATCH "http://localhost:8765/api/tasks/$TASK_ID" \
  -H 'Content-Type: application/json' \
  --data '{"title":"Updated synthetic integration check","status":"done"}'
```

```bash
curl --fail-with-body -X DELETE "http://localhost:8765/api/tasks/$TASK_ID"
```

Creating notes/tasks changes the local preview database. These examples do not establish that a teammate's external agent is working. Do not run them against production as anonymous requests.

## Current language-service contract

### Provider selection

| Setting | Purpose |
| --- | --- |
| `LLM_PROVIDER` | `chat_completions` by default; set `azure_responses` for the Azure primary provider |
| `AZURE_AGENT_ENDPOINT` | Full agent Responses URL including `?api-version=v1`; never substitute the resource root |
| `AZURE_AGENT_API_KEY` | Runtime secret sent only to the configured Azure endpoint in the `api-key` header |
| `LLM_BASE_URL`, `LLM_MODEL`, `LLM_API_KEY` | Existing Chat Completions provider; retain these when enabling Azure because utility generation and the existing transcription configuration still use them |

Nonsecret Azure configuration:

```dotenv
LLM_PROVIDER=azure_responses
AZURE_AGENT_ENDPOINT=https://AstronautHealthAI.services.ai.azure.com/api/projects/AstronautHealthAI/agents/NASA-AI/endpoint/protocols/openai/responses?api-version=v1
```

Provision `AZURE_AGENT_API_KEY` through ignored local development settings or the hosted secret configuration. Do not include a real key in an example file or commit. Azure configuration does not require `LLM_MODEL`; the agent selects its deployed model. Unknown provider names, missing Azure credentials, invalid/non-HTTPS endpoints, failed/incomplete responses, and empty final output produce an availability error instead of a fabricated answer.

The Azure adapter sends `input` with explicit `type: "message"` items preserving the existing ordered system prompt and conversation messages. Text/image content parts become `input_text`/`input_image` without discarding dates, image detail, or supplied frames. It sets `stream: false`, `store: false`, and `max_output_tokens`. Agent-level reasoning settings are not overridden: the verified dedicated endpoint rejects a request-level `reasoning` field. The configured URL is used as a full endpoint, with `api-version=v1` added only when no API version is supplied. Azure redirects are not followed. The adapter extracts assistant message `output_text` and ignores reasoning/tool payloads; protocol `status: completed` is required.

Autocomplete, semantic story tags, and historical English translation explicitly use the existing Chat Completions utility provider even when Azure is the primary provider. This prevents a dedicated health agent's JSON instructions from replacing a text suffix, tag object, or translation array. If the utility provider is absent, those features keep their existing fallback/unavailable behavior; they do not silently send their inputs to the health agent. There is no automatic cross-provider retry. `AIR_GAP=1` blocks Azure even if old local model settings remain; the explicitly supported local utility path is unchanged.

Ordinary chat, diary answers, and recording analyses render only a narrowly validated health object (`NORMAL`/`ATTENTION`/`CRITICAL`, `alerts`, `summary`) as readable summary, status, and alerts. Other JSON stays unchanged, and utility callers always receive raw text for their existing parsers. Saved recording analyses identify Azure as `media-analysis:azure_responses/NASA-AI`, rather than attributing the answer to an unrelated utility model. Owner/profile boundaries, references, attachments, and reply IDs are unchanged.

### Chat Completions

The default provider and utility requests send:

```http
POST {LLM_BASE_URL}/chat/completions
Content-Type: application/json
Authorization: Bearer {LLM_API_KEY}
```

```json
{
  "model": "configured-model-name",
  "messages": [
    {"role":"system","content":"Instructions for the selected application feature."},
    {"role":"user","content":"The feature's selected input."}
  ],
  "max_completion_tokens": 1536,
  "reasoning_effort": "low",
  "store": false
}
```

`LLM_BASE_URL` excludes the final `/chat/completions` suffix. The example configuration uses an OpenAI-compatible provider; actual credentials remain in ignored `.dev.vars` or the hosted runtime settings. Different features override output limits, timeouts, retry counts, and redirect handling. Multimedia requests can include OpenAI-compatible `image_url` content parts. Responses must expose `choices[0].message.content` as text or supported text parts. Both transports preserve the existing retry budget: connection failures and HTTP 502/503/504 may retry; other statuses and invalid completed responses do not.

The browser-facing chat/diary result remains text. A custom FastAPI endpoint or native Anthropic Messages endpoint is not automatically compatible with either supported transport. The separate `/api/health-analysis` workflow validates structured results and enforces its deterministic prototype severity floor.

Optional services use separate settings:

| Service | Settings / contract |
| --- | --- |
| Text memory | `MEMORY_URL`, `MEMORY_API_KEY`; bearer-authenticated `/health`, `/upsert`, `/search`, `/answer` |
| Cloud transcription | `SPEECH_API_URL`, `SPEECH_API_KEY`, `SPEECH_MODEL`; Whisper-compatible multipart request |
| Local transcription | `LOCAL_SPEECH_URL`, `LOCAL_SPEECH_KEY`, `LOCAL_SPEECH_MODEL`; explicitly configured local adapter |
| Isolation | `AIR_GAP=1` prevents cloud assistant calls; feature-specific local allowances are tested separately |

Never put service keys in browser JavaScript, a GitHub issue, or an example request committed to Git.

## External health-agent: verified endpoint and remaining handoff

The separately supplied deployment was tested on 2026-11-13 with synthetic inputs only:

```http
POST https://AstronautHealthAI.services.ai.azure.com/api/projects/AstronautHealthAI/agents/NASA-AI/endpoint/protocols/openai/responses?api-version=v1
Content-Type: application/json
api-key: <server-side secret>
```

The resource root `https://astronauthealthai.services.ai.azure.com/` is not the complete agent invocation URL. Send a Responses request with `input` and `stream: false`; the tested dedicated endpoint did not require a `model` field.

Two requests succeeded with HTTP 200 and protocol `status: completed`: a connectivity message and the document's synthetic example (heart rate 112 bpm, SpO2 94%, temperature 38.1 C, respiratory rate 17, blood pressure unavailable, fatigue High, rule status ATTENTION). The final generated text for the second request was:

```json
{
  "status": "ATTENTION",
  "alerts": [
    "Heart rate 112 flagged",
    "SpO2 94% flagged",
    "Temperature 38.1 flagged",
    "High fatigue flagged"
  ],
  "summary": "Several monitored values are outside expected range for this sample, and the recent trend shows heart rate and temperature rising while SpO2 is falling. Mission control should continue close monitoring."
}
```

The tested response reported model `gpt-5.4-mini`; the connectivity response identified agent `NASA-AI`, version `2`. These are observations from this deployment, not guarantees about future routing. This test establishes connectivity and one sample response, not clinical validity or complete contract compatibility.

The response's `output` array can begin with reasoning or tool items. Extract final text from items with `type: "message"`, then content parts with `type: "output_text"`. Do not display encrypted reasoning or treat protocol `completed` as a health classification.

The supplied `api-key` was empirically accepted by this deployment. Microsoft's current general agent-configuration documentation describes Entra/RBAC authorization and says API-key authentication is not supported; confirm the deployment's intended authentication with its owner before permanent integration. No key is stored in this repository, test artifacts, or documentation.

Official protocol references:

- https://learn.microsoft.com/en-us/azure/foundry/quickstarts/get-started-code
- https://learn.microsoft.com/en-us/azure/foundry/agents/how-to/configure-agent
- https://learn.microsoft.com/en-us/azure/foundry/agents/how-to/manage-hosted-sessions

The live sample returns `alerts` as strings, while the proposed document describes alert objects. The Worker now supports this endpoint through `LLM_PROVIDER=azure_responses`. Changing `LLM_BASE_URL` alone is still incorrect: that setting belongs to the separate Chat Completions adapter. Runtime configuration and a hosted smoke test determine whether a specific deployment uses Azure.

Before expanding this prototype into authenticated device ingestion, confirm the remaining production contract with the agent owner:

- The intended production authentication and how backend credentials will be provisioned privately.
- A complete request example and response example from the actual service.
- Units, optional/missing fields, timestamp and astronaut-ID conventions, and the numeric fatigue/stress scale.
- Whether the service receives raw readings, a precomputed rule result, recent history, or all three.
- Timeout, error, rate-limit, and retry/idempotency behavior.
- Confirmation of how `NORMAL`, `ATTENTION`, and `CRITICAL` interact with the deterministic rule-engine result.
- Synthetic test cases and expected output for normal, missing-data, boundary, and failure cases.

The supplied design document states that an agent may raise, but never lower, the rule-engine severity. The structured route now enforces and tests that invariant in application code, including malformed and contradictory replies, rather than relying on a prompt alone. The documented thresholds are illustrative and are not validated medical limits.

The `/api/health-analysis` route now implements the prototype readings workflow below. It does not add a physical device connection or validate the medical meaning of the project document thresholds.

### Integration verification on 2026-11-14

The published configuration selects `azure_responses` for primary chat, diary answers, and recording analysis. The API key is a hosted runtime secret. Utility tasks retain the separately configured Chat Completions provider.

Live requests through the actual Worker adapter verified the following with synthetic data only:

| Check | Result |
| --- | --- |
| Document payload with astronaut, latest readings, rule result, and recent trend | HTTP 200, completed, `ATTENTION`, four string alerts |
| Ordered user/assistant history followed by a recall question | HTTP 200, correct recall of the supplied earlier entry |
| JPEG frame supplied as an image content part | HTTP 200, correct description of the solid-color synthetic image; no person invented |

All three responses reported `gpt-5.4-mini`. The model is selected by the upstream agent and may change. These are transport and response checks, not validation of medical accuracy or a complete implementation of the proposed readings workflow.

Diary context now retains the recorded self-report, normalized 1-100 scale, and entry date. A wellbeing score is not an objective sensor reading or a fatigue measurement. Structured health JSON is formatted for display in new and previously saved replies, including recording retries, recent results, history, and the archive. Read-time formatting does not rewrite historical originals or send another model request.

The current media request sends the transcript, supported browser measurements, and up to three selected video frames. It does not send the entire original audio/video file to Azure. General chat now receives a saved numeric dashboard snapshot with source and time metadata. Canonical Actiwatch summary data is loaded by owner and explicit import ID. Past recording analyses are not automatically attached. Dashboard skin temperature is never relabeled as body temperature. The structured readings route enforces its own deterministic prototype status independently of free-form conversation.

## Prototype readings workflow

`POST /api/health-analysis` accepts exactly `{id, snapshot}`. `id` is a UUID. `snapshot` contains `profileId: "personal"`, an ISO `capturedAt`, optional `actiwatchImportId`, and a `readings` object. Each reading is null or `{value, unit, source, observedAt}`. Allowed sources are `demo`, `manual`, and `import`. Example readings have `observedAt: null`; the snapshot time is not a sensor time. Manual/import observations require valid timestamps. Client source labels do not establish a verified device connection.

| Reading keys | Canonical unit |
| --- | --- |
| `heart_rate` | `bpm` |
| `spo2` | `%` |
| `body_temperature`, `skin_temperature` | `C` |
| `bp_systolic`, `bp_diastolic` | `mmHg` |
| `respiratory_rate` | `/min` |
| `fatigue_index`, `stress_index`, `wellbeing`, `recovery` | `/100` |
| `sleep_hours`, `hrv`, `steps`, `activity`, `light` | `h`, `ms`, `steps`, `counts`, `lx`, respectively |

Unknown fields, profiles, wrong units, numeric strings, non-finite values and invalid times are rejected. `import` is restricted to sleep/activity/light and an explicitly selected owned Actiwatch import. The server replaces those values from the stored summary and its recording end time. It never sends raw CSV, vectors, or another owner's records to the agent.

For example, a synthetic manually reported core uses `heart_rate: {value:112,unit:"bpm",source:"manual",observedAt:"<current ISO timestamp>"}` together with SpO2 94 percent and body temperature 38.1 C. Set `capturedAt` to the current time too. An actual missing body temperature stays null; skin temperature cannot fill it. Wellbeing and recovery cannot become fatigue/stress indices.

Version `pdf-prototype-v1` implements the project document's illustrative thresholds: HR normal 50-100, critical below 40 or above 120; SpO2 normal at least 95, critical below 90; body temperature normal 36-37.5, critical below 35 or above 38.5; systolic normal 90 to below 140, critical below 80 or at least 180; diastolic normal 60 to below 90, critical below 50 or at least 110; respiration normal 12-20, critical below 8 or above 25. Intermediate values are ATTENTION. Fatigue/stress at least 70 is ATTENTION with no independent critical level. Continuous comparisons fill decimal gaps without rounding observations.

Blood pressure and fatigue/stress each count as one group using the worse available component. Five abnormal groups out of six escalate to CRITICAL. Several abnormal groups produce an explicit combination note. Core observations older than 15 minutes are excluded as stale. Missing data is No signal, not zero or normal. A complete core assessment requires usable HR, SpO2 and body temperature; otherwise a result with no known abnormality has `status: null` and the UI displays Incomplete. Known ATTENTION/CRITICAL values remain flagged under incomplete coverage. The scope is explicitly an example whenever demo readings are included.

The response has `snapshot`, `rules`, `result`, `createdAt`, `updatedAt`, and `pending`. Rules contain their version, per-group results, missing/stale lists, coverage and combination/escalation metadata. Result contains final status, original agent status, summary, readable alerts, `downgradeBlocked` and `agentAvailable`. Alert values accept bounded strings, finite numbers, and null as returned by the tested deployment; null becomes No signal / info. A blocked downgrade discards contradictory model prose and alerts as well as retaining the rule floor. The final status cannot be lower than the server rule floor. Invalid JSON/schema, unavailable service and `AIR_GAP=1` preserve a saved rules-only result instead of inventing successful AI analysis.

An ID with an unchanged canonical snapshot reuses a successful result. Another owner or a different snapshot conflicts. Failed analyses can be retried with the same ID; a 60-second server lease prevents overlapping model calls. An overlapping POST returns HTTP 202 with `pending: true`. GET `/api/health-analysis` returns `{item: <latest or null>}`; GET `/api/health-analysis/{id}` reads one owned record. Reads never call a model.

Agent input contains `astronaut`, unknown `mission_time: null`, `latest`, `rule_result`, provenance, and `recent_trend`. Trends require ten distinct non-demo observation times from the same source: the mean of the latest five versus the previous five. Insufficient history and generated chart data never become a real trend.

The browser calls Azure analysis only when Analyze is selected. Chat automatically attaches `healthSnapshot` once when creating its pending request. The server saves the canonical snapshot and rules in `message.healthContext`; retries reuse that original context even if the dashboard has changed. Ordinary conversation remains separate from the structured Health analysis and does not gain diary access.

These are the team's documented prototype rules, not validated medical limits or a medical device. Actual device ingestion and validated mission-specific thresholds require a separate deployment contract.

## Errors and compatibility

JSON failures use an `error` code, typically with HTTP 400 for invalid input, 401 for missing identity, 403 for forbidden origin/access mode, 404 for unavailable owned material, 409 for ID conflicts, 413 for upload limits, and 503 for unavailable storage or services. Routes can use more specific codes such as `invalid_wellbeing`, `speech_upstream_error`, or `assistant_unavailable`.

Do not interpret an HTTP 201 recording/message response as proof that its model analysis succeeded. Check the returned status, `reply`, `replyError`, `saved`, and feature availability fields. Never label missing sensor data or a failed model response as a normal health result.
