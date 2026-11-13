# Mission Health API and agent integration

This document describes the API implemented in `worker/`. It is a collaboration contract for the current prototype, not a claim that an external health-analysis service is connected.

## Two separate integration surfaces

1. **Application API:** the browser calls the same-origin `/api/` routes below. These manage identity, chat, diary, recordings, tasks, and research-related imports.
2. **Language-service adapter:** the Worker calls a configured OpenAI-compatible service using `LLM_BASE_URL`, `LLM_MODEL`, and `LLM_API_KEY`.

A teammate's structured health-analysis agent is a third service. The supplied project document proposes input/output JSON but does not itself include a deployment address. The separately supplied Azure deployment was tested successfully; see the external-agent section below. Do not substitute the existing diary/chat endpoint for that agent API.

## Environments and authentication

| Environment | Base URL | Identity |
| --- | --- | --- |
| Local development | `http://localhost:8765` | `LOCAL_PREVIEW=1` in `wrangler.jsonc` selects the `local-preview` owner |
| Hosted site | `https://mission-health-orbit-2026.crownbobbytron.chatgpt.site` | Sites authenticates the visitor and injects the trusted `oai-authenticated-user-id` header |

The production API is not a public anonymous REST service. Use the hosted site through its authenticated browser session. A caller-supplied identity header is not a supported production authentication method. Do not spoof it, expose a bypass token, or add `LOCAL_PREVIEW=1` to production.

JSON mutation requests use `Content-Type: application/json`. File and recording uploads use `multipart/form-data`. Non-GET requests with a foreign `Origin` or `Sec-Fetch-Site: cross-site` are rejected. The Worker does not offer a general cross-origin API integration contract. A teammate's external service should be called from a server-side adapter, with its credentials kept on the server.

Personal diary, media, tasks, and favorites are scoped to the signed-in owner. Group-chat messages form a shared channel for site participants; an attachment becomes shared only after it is explicitly posted there. A display name is not an authorization identity.

## Main routes

`{profile}` is one of `personal`, `jessica-meir`, `jack-hathaway`, or `christina-koch`. Profile IDs select separate prototype histories; they do not identify real astronauts' medical records.

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/api/status` | Report configured assistant, history, photo, and semantic-memory capabilities |
| GET | `/api/me` | Return `name`, `researcherId`, and account-scoped `storageScope` |
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

The server sends:

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

`LLM_BASE_URL` excludes the final `/chat/completions` suffix. The example configuration uses an OpenAI-compatible provider; actual credentials remain in ignored `.dev.vars` or the hosted runtime settings. Different features override output limits, timeouts, retry counts, and redirect handling. Multimedia requests can include OpenAI-compatible `image_url` content parts. Responses must expose `choices[0].message.content` as text or supported text parts.

The ordinary chat/diary result is plain-language text. It is not the structured `status`/`alerts`/`summary` object proposed in the external project document. Confirm that a teammate's service accepts this exact protocol before pointing the current adapter at it. A custom FastAPI endpoint or native Anthropic Messages endpoint is not automatically compatible.

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

The live sample returns `alerts` as strings, while the proposed document describes alert objects. A separate Responses adapter is required: changing `LLM_BASE_URL` alone would still append `/chat/completions`, send the wrong body, and read the wrong response structure. The production diary/chat provider has not been replaced.

Before integration, still confirm the following with the agent owner:

- The intended production authentication and how backend credentials will be provisioned privately.
- A complete request example and response example from the actual service.
- Units, optional/missing fields, timestamp and astronaut-ID conventions, and the numeric fatigue/stress scale.
- Whether the service receives raw readings, a precomputed rule result, recent history, or all three.
- Timeout, error, rate-limit, and retry/idempotency behavior.
- Confirmation of how `NORMAL`, `ATTENTION`, and `CRITICAL` interact with the deterministic rule-engine result.
- Synthetic test cases and expected output for normal, missing-data, boundary, and failure cases.

The supplied design document states that an agent may raise, but never lower, the rule-engine severity. If that structured agent is implemented, enforce and test that invariant in application code rather than relying on a prompt alone. The documented thresholds are illustrative and are not validated medical limits.

The external Azure agent is reachable, but this application does not yet expose a readings-ingestion or structured health-agent route matching the document. Add the adapter and its tests after agreeing on the remaining service contract. Keep diary/chat integration separate unless the team explicitly chooses to change it.

## Errors and compatibility

JSON failures use an `error` code, typically with HTTP 400 for invalid input, 401 for missing identity, 403 for forbidden origin/access mode, 404 for unavailable owned material, 409 for ID conflicts, 413 for upload limits, and 503 for unavailable storage or services. Routes can use more specific codes such as `invalid_wellbeing`, `speech_upstream_error`, or `assistant_unavailable`.

Do not interpret an HTTP 201 recording/message response as proof that its model analysis succeeded. Check the returned status, `reply`, `replyError`, `saved`, and feature availability fields. Never label missing sensor data or a failed model response as a normal health result.
