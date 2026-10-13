# Architecture

Kuru is a decoupled, offline-first client/server application. The authoritative design document is
[`CLAUDE.md`](../CLAUDE.md); this page describes the system *as implemented* and is updated as
components land.

```
Browser (PWA)                                   Server
┌─────────────────────────────────┐            ┌──────────────────────────────┐
│ Next.js App Router (RSC + CC)   │  REST/JSON │ FastAPI                       │
│ ts-fsrs (local scheduling)      │ ─────────▶ │  ├─ Anki importer (bg tasks)  │
│ Dexie (IndexedDB: cards/outbox) │ ◀───────── │  ├─ FSRS engine (py-fsrs)     │
│ Serwist service worker (cache)  │            │  ├─ Sync (revlog replay)      │
└─────────────────────────────────┘            │  └─ SQLite (SQLModel/Alembic) │
                                               └──────────────────────────────┘
```

## Core principles

1. **The revlog is the source of truth.** Card memory state (stability, difficulty, due) is always
   derivable by replaying the review log through FSRS. Clients compute optimistic states locally;
   the server replays and returns the authoritative state.
2. **Preserve Anki identity.** Original Anki ids, note `guid`s, `usn`/`mod` values and raw configuration
   are stored so a future `.apkg` export or AnkiWeb sync can be lossless.
3. **Ownership everywhere.** Every user-owned row carries a `user_id`. v1 runs in single-user mode, but
   all data access is scoped to the current user so multi-user support is an auth-layer change only.
