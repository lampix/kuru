# Offline sync

Reviewing never waits for the network. Every answer is computed on the device and synchronised later.

## Answering

1. The study session computes the next memory state with `ts-fsrs` (`lib/fsrs/engine.ts`), applying
   the deterministic fuzz shared with the server.
2. In one IndexedDB transaction the card is updated, a review row is stored (for daily limits and
   undo) and an **outbox** entry with a client-generated UUID is appended.
3. The sync manager uploads the outbox ~3 s later (debounced). If that fails it registers a
   Background Sync (where supported) and retries on the next trigger.

## Sync cycle (`lib/sync/engine.ts`)

| Step | Endpoint | Notes |
| --- | --- | --- |
| 1 | `POST /api/sync/reviews` | outbox in batches of 500; idempotent by review UUID |
| 2 | `GET /api/sync/meta` | decks, presets, note types, timezone, `server_time` |
| 3 | `GET /api/sync/cards?since=&after_id=` | cards whose scheduling or note changed, keyset-paged |
| 4 | `GET /api/sync/card-ids` | prune cards deleted on the server |
| 5 | `GET /api/sync/reviews?since=` | reviews of the last two study days (daily limits from other devices) |
| 6 | `GET /api/sync/media` | manifest; new/changed files are downloaded into CacheStorage |

`server_time` from step 2 becomes `since` for the next cycle. Cards that still have pending outbox
entries are never overwritten by pulled data (the local state is newer).

Triggers: app start, `online` event, app becoming visible, every 5 minutes, after answers, and the
sync button.

## Server-side merge (`services/reviews.py`)

* Reviews are inserted keyed by UUID — re-sending is harmless; duplicates return the current state.
* **In-order** reviews are applied to the stored card state. This keeps Anki's imported memory state
  intact.
* **Out-of-order** reviews (e.g. two offline devices) trigger a rebuild: every Kuru review stores a
  `memory_before` snapshot, so the card is re-derived from the snapshot that precedes the earliest
  affected review, replaying the later reviews chronologically. Without a usable snapshot the whole
  review log is replayed.
* The response contains the authoritative state of every affected card, which replaces the local one.

## Undo

Undo removes the outbox entry and restores the previous local state while the review is still
pending. Once uploaded, `DELETE /api/reviews/{id}` restores the snapshot (or rebuilds the card).

## Service worker (`src/sw.ts`)

| Request | Strategy |
| --- | --- |
| hashed assets, all prerendered pages, icons | precached at install |
| `/api/media/*` | cache first (`kuru-media-v1`, filled by the sync engine) |
| other `/api/*` | network only |
| RSC payloads, navigations | network first (4 s timeout), cached fallback |
