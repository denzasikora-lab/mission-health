# Team handoff

Mission Health / Bug Busters / NASA Space Apps.

- Website: https://mission-health-bug-busters.vercel.app/
- Code: https://github.com/denzasikora-lab/mission-health

## Responsibilities

- Egor and Hammad: website and backend.
- Hanzala: Azure NASA-AI agent.
- Aslam: demo video.
- Hijab: documentation and slides.

## Main API routes

| Feature | Request |
| --- | --- |
| NasaGPT Send | `POST /api/chat` |
| Health Analyze | `POST /api/health-analysis` |
| Audio/video analysis | `POST /api/media-analysis` |
| Archive search and answer | `POST /api/astronauts/personal/book-search`, then `/book-answer` |
| Scheduled tasks | `GET`, `POST /api/tasks`; `PATCH`, `DELETE /api/tasks/{id}` |
| Astronaut group chat | `GET`, `POST /api/team-chat` |

Use the website's `/api/` routes with its signed browser-session cookie. Azure keys stay on the server. External scripts should use the local development server; production has no separate integration token.

Vercel serves the frontend. The Node.js API and private SQLite/files run on **t213**. EmbeddingGemma 2 and Qdrant run on **t4**. The API calls Hanzala's Azure agent; utilities use ProxyAPI mini. Archive RAG is available through Archive search. CPU LoRA training runs privately on t213 using PyTorch, Transformers and PEFT; adapters are retained separately from Azure.

The repository is public. Forks and pull requests are open; direct write access requires a GitHub invitation. Merging into `main` deploys the frontend to Vercel. Backend releases are separate.

Details: [API contract](API.md), [local setup](../CONTRIBUTING.md), [deployment](VERCEL_DEPLOYMENT.md), [local Postman requests](mission-health.postman_collection.json).
