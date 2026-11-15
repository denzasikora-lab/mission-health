# API guide

Website: https://mission-health-bug-busters.vercel.app/

The browser calls `/api/*`. Vercel forwards requests to the Node.js API on t213. Signed guest cookies isolate private records; `GET /api/session` starts the session. There is no separate production integration token. Do not supply identity headers or put service keys in frontend code.

For external-script development, use http://localhost:8765 and the [local Postman collection](mission-health.postman_collection.json). See [local setup](../CONTRIBUTING.md) and [deployment](VERCEL_DEPLOYMENT.md).

## Routes

| Methods | Path | Purpose |
| --- | --- | --- |
| GET | `/api/status` | Configured capabilities |
| GET, PUT | `/api/me` | Profile; PUT body: `{"name":"Cdr. Sara Khan"}` |
| GET, POST, DELETE | `/api/chat` | NasaGPT conversation; DELETE clears only this chat, preserving Favorites, Scheduled, Group chat and Archive |
| GET, POST | `/api/team-chat` | Shared astronaut messages; no AI reply |
| GET, POST | `/api/readings` | Persist personal measurements and their provenance |
| GET, POST | `/api/health-analysis` | Saved analysis or Analyze: rules plus Azure explanation |
| GET | `/api/health-analysis/{id}` | One owned saved analysis |
| POST | `/api/research-analysis` | Personal trends + retrieved NASA evidence + Azure; saves the review in Archive |
| GET | `/api/research-analysis/{id}` | Owned review or pending status |
| GET, POST | `/api/tasks` | List/create scheduled tasks |
| PATCH, DELETE | `/api/tasks/{id}` | Edit/cancel a task |
| POST | `/api/chat-files` | Upload an attachment; GET `/api/chat-files/{id}` retrieves it |
| GET, POST | `/api/media-analysis` | Restore results or upload audio/video for analysis |
| POST | `/api/transcriptions` | Multipart speech-to-text upload |
| GET, POST | `/api/actiwatch` | List/import validated Actiwatch CSV recordings |
| GET | `/api/actiwatch/{id}` | Owned recording epochs and summary |
| GET, POST | `/api/astronauts/{profile}/messages` | Diary notes or assistant questions |
| GET | `/api/astronauts/{profile}/book` | Archive entries |
| POST | `/api/astronauts/{profile}/book-search` | Search owned archive material |
| POST | `/api/astronauts/{profile}/book-answer` | Answer from selected retrieved entries |
| POST | `/api/compose`, `/api/story-tags` | Draft continuation and English hashtags |

`{profile}` is `personal`, `jessica-meir`, `jack-hathaway` or `christina-koch`. These are prototype profiles, not real astronauts' medical records. The default personal persona is **Cdr. Sara Khan / AST-014 / Orion Station / Expedition 7**.

JSON requests use `Content-Type: application/json` and `x-mission-language: en|ur|es`. Current additional/internal routes are defined in [worker/index.js](../worker/index.js).

Research body: `{id, topic, days, snapshot, study?}`. Optional `study: {source, participant, metric}` selects the exact NASA chart; values are validated against the bundled study. Use a UUID, `topic: recovery|blood|behavior`, `days: 1|7|30`, and the same snapshot format as Health Analyze. Reuse the unchanged request ID when retrying. Public NASA evidence has its own Qdrant namespace; personal history remains owner-scoped. Source data and checksums: `/data/nasa-research.json`.

## Send a message

```json
{
  "id": "12345678-1234-4234-8234-123456789abc",
  "content": "Tomorrow at 10:00 I need to check the task list.",
  "attachments": [],
  "timeZone": "Europe/Istanbul"
}
```

`POST /api/chat` returns `message`, `reply`, `replyError` and extracted `tasks`. A message can remain saved while `reply` is null because the agent is unavailable. Reuse the same UUID and unchanged payload when retrying. Group chat returns a saved message without an AI response.

For diary messages, add `mode: "diary"` to save only or `mode: "ask"` for an answer using retrieved diary context. Ordinary NasaGPT does not automatically search the archive; use Archive search for RAG.

## Readings and tasks

Readings contain `value`, `unit`, `source` and `observedAt`. Missing values stay null. Heart rate uses bpm, SpO2 %, temperature C, pressure mmHg and respiration /min. The 15 cards share one model with 16 numeric channels because blood pressure has two values. Analyze and NasaGPT use this model.

**FILL SAMPLE** generates marked fictional cards and matching period charts locally. It neither calls a model nor overwrites saved measurements. Clear restores actual data. Examples retain `source: "demo"` and null observation times.

Health Analyze accepts `{id, snapshot}` and returns structured `NORMAL`, `ATTENTION` or `CRITICAL` results when sufficient data exist. Missing core readings remain incomplete; skin temperature does not replace body temperature. Results are prototype observations, not diagnoses.

Task creation uses `id`, `title`, `dueDate` (`YYYY-MM-DD`), optional `dueTime` (`HH:mm`) and `timeZone`. PATCH accepts those editable fields plus `status: "planned"|"done"|"cancelled"`. Responses retain local scheduling fields and UTC `dueAt` where applicable.

## Recordings

`POST /api/media-analysis` takes multipart `id`, `kind` (`audio` or `video`), `file`, `duration`, optional `transcript`, `features` JSON and `createdAt`. Video can include 1-3 JPEG `frame` fields. Limits: 16 MiB media, 125 seconds, 350,000 bytes/frame. Use actual recorded measurements, not invented features.

The server saves the recording, transcribes when needed, asks Azure and stores the archive result. Unavailable analysis does not discard the original. GET restores results without another model call. See [media-analysis.js](../worker/media-analysis.js) and [capture implementation](../public/media-diary.js) for the feature schema.

Video face vectors are compared with the previous owned face-bearing session using cosine similarity and measured deltas. The first usable session becomes the reference. Camera/pose/lighting changes can pause comparison. Vectors stay private; similarity and experimental apparent age are not health scores.

## Providers and errors

- **Primary:** `LLM_PROVIDER=azure_responses`, full `AZURE_AGENT_ENDPOINT` including `?api-version=v1`, server-only `AZURE_AGENT_API_KEY`. Calls use Responses `input`, `stream: false`, `store: false`. The resource root is not an invocation endpoint; the dedicated agent selects its model.
- **Utilities:** `LLM_BASE_URL=https://api.proxyapi.ru/v1`, `LLM_MODEL=openai/gpt-5-mini`, private `LLM_API_KEY`. Used for completions/hashtags, not automatic Azure failover. Cloud transcription uses Whisper separately.
- **Memory:** `MEMORY_URL`, private `MEMORY_API_KEY`; EmbeddingGemma 2 and Qdrant on t4 support archive retrieval.

Check HTTP status and availability fields. Typical outcomes: `201` saved, `202` pending, `409` conflicting reused ID, `429` quota limit, `503` unavailable. A saved entry is not proof that analysis succeeded. Retry unchanged requests; keep missing data and service failures visible. Personal data remain owner-scoped; only explicitly posted group-chat content is shared.
