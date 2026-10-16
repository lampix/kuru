# HTTP API

The backend serves interactive OpenAPI documentation at `/docs` (Swagger UI) and `/redoc`; the
schema is at `/openapi.json`. These live on the backend itself (e.g. `http://localhost:8000/docs` in
development); the frontend only proxies `/api/*`, so they are not reachable through the app's public
URL yet (see [roadmap](roadmap.md#client-api-for-third-party-apps)). All endpoints are under `/api` and exchange JSON with timezone-aware
ISO 8601 timestamps.

## Authentication

| Endpoint | |
| --- | --- |
| `GET /auth/info` | `{requires_login}` |
| `POST /auth/login` | `{token}` → sets the `kuru_session` cookie |
| `POST /auth/logout` | clears the cookie |
| `GET/PATCH /auth/me` | profile: name, timezone, day rollover hour |

When `KURU_ACCESS_TOKEN` is set, send `Authorization: Bearer <token>` or the session cookie.

## Decks, presets and cards

| Endpoint | |
| --- | --- |
| `GET /decks` | deck tree with today's new / learning / review counts |
| `POST /decks`, `GET/PATCH/DELETE /decks/{id}` | manage decks (`A::B` hierarchy) |
| `GET /decks/{id}/due` | today's queue with note content and note types |
| `GET/POST /presets`, `GET/PATCH/DELETE /presets/{id}` | deck option presets |
| `POST /presets/{id}/optimize?apply=` | fit FSRS weights |
| `POST /presets/{id}/reschedule` | recompute cards from their history |
| `POST /cards/actions` | `suspend`, `unsuspend`, `bury`, `unbury`, `forget`, `move` |
| `GET /cards/{id}/memory` · `/preview` · `/history` | FSRS state, interval previews, review log |
| `POST /cards/{id}/answer` | answer online (`{rating, id?, reviewed_at?, duration_ms?}`) |
| `DELETE /reviews/{id}` | undo a review |

## Sync, media, import, statistics

| Endpoint | |
| --- | --- |
| `POST /sync/reviews` | upload queued reviews (idempotent) |
| `GET /sync/meta` · `/cards` · `/card-ids` · `/reviews` · `/media` | see [sync](sync.md) |
| `GET /media/{filename}` | media file (ETag) |
| `POST /import/uploads` · `PUT /import/uploads/{id}?offset=` · `POST /import/uploads/{id}/complete` | chunked upload |
| `POST /import` | single multipart upload (scripts) |
| `GET /import/status/{job_id}` · `GET /import/jobs` | import progress |
| `GET /stats?deck_id=` | statistics |
| `GET /health` | liveness |

Example — import from the command line:

```bash
curl -F file=@Japanese.apkg http://localhost:3000/api/import
```
