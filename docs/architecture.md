# Architecture

Kuru is a decoupled, offline-first client/server application. The original design document is
[`CLAUDE.md`](../CLAUDE.md); this page describes the system *as implemented*.

```
Browser (installable PWA)                               Server (single process)
┌────────────────────────────────────────────┐          ┌──────────────────────────────────────┐
│ Next.js App Router — static pages /en, /de │          │ FastAPI                              │
│  ├─ iOS design system (Tailwind, shadcn/ui)│  /api/*  │  ├─ auth (AuthProvider, single user) │
│  ├─ template renderer → Shadow DOM         │ ───────▶ │  ├─ Anki importer (background task)  │
│  ├─ ts-fsrs scheduler (+ shared fuzz)      │ rewrite  │  ├─ FSRS-6 engine (py-fsrs)          │
│  ├─ local queue builder                    │ ◀─────── │  ├─ review recording / revlog replay │
│  └─ sync manager                           │          │  ├─ queue, presets, stats, media     │
│ IndexedDB (Dexie): cards, decks, outbox …  │          │  └─ SQLite (SQLModel, Alembic, WAL)  │
│ Service worker (Serwist): precache, media  │          │     + content-addressed media files  │
└────────────────────────────────────────────┘          └──────────────────────────────────────┘
```

## Principles

1. **The review log is the source of truth.** Clients compute the next state locally (`ts-fsrs`) and
   queue the answer; the server records it idempotently, merges late reviews chronologically and
   returns the authoritative state ([ADR 0004](adr/0004-client-scheduling-server-truth.md),
   [sync](sync.md)).
2. **Preserve Anki identity.** Original ids, note `guid`s, `usn`/`mod` and raw configuration are
   stored so a future `.apkg` export or Anki sync can be lossless ([importer](importer.md)).
3. **Ownership everywhere.** Every row carries a `user_id`; all queries go through the `CurrentUser`
   dependency. Multi-user support only needs a new `AuthProvider`
   ([ADR 0003](adr/0003-single-user-with-ownership.md)).
4. **Static, cacheable frontend.** Every page is prerendered per locale; data comes from IndexedDB.
   Ids travel in query strings (`/en/study?deck=12`) so the cached shell serves every deck offline.

## Backend (`backend/src/kuru`)

| Module | Responsibility |
| --- | --- |
| `core/config.py` | `KURU_*` settings |
| `core/security.py` | `AuthProvider` protocol, `SingleUserAuthProvider` (optional token, cookie) |
| `core/time.py` | study-day maths (timezone + rollover hour) |
| `db/` | engine (SQLite WAL), UTC datetime column type, migration runner |
| `models/` | SQLModel tables: user, deck, deck_config, note_type, note, card, review_log, media_file, import_job |
| `services/fsrs/` | FSRS-6 engine, weight migration, deterministic fuzz, optimizer |
| `services/reviews.py` | idempotent recording, out-of-order merge via memory snapshots, undo |
| `services/importer/` | package reader for all Anki formats, protobuf decoder, persistence, jobs |
| `services/queue.py` | daily study queue and deck tree with limits |
| `services/stats.py` | statistics |
| `api/routes/` | REST endpoints ([API](api.md)) |

## Frontend (`frontend/src`)

| Path | Responsibility |
| --- | --- |
| `app/(root)/page.tsx` | `/`: chooses the locale on the client (works offline) |
| `app/[locale]/…` | statically generated screens (decks, study, browse, stats, settings) |
| `components/ios/` | HIG primitives: navigation bar, grouped lists, segmented control, tab bar |
| `components/review/` | study screen, card view (Shadow DOM), answer buttons |
| `lib/fsrs/` | `ts-fsrs` wrapper, deterministic fuzz, interval formatting |
| `lib/render/` | Anki template engine, cloze, filters, sanitising, plugin hooks |
| `lib/db/` | Dexie schema and hooks |
| `lib/study/` | local queue, deck tree, study-day maths, answer recording, session hook |
| `lib/sync/` | outbox flush, sync cycle, media pre-caching, sync manager |
| `sw.ts` + `scripts/build-sw.mjs` | service worker, built after `next build` |
