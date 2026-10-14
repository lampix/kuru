# Anki import pipeline

Kuru imports `.apkg` (deck package) and `.colpkg` (collection package) files produced by any Anki
version, preserving scheduling state and the full review history.

## Flow

1. The browser uploads in **resumable 5 MB chunks**: `POST /api/import/uploads` announces the file,
   `PUT /api/import/uploads/{id}?offset=…` appends chunks (re-sent chunks are ignored, a wrong
   offset returns `409` with the expected position via `GET /api/import/uploads/{id}`), and
   `POST /api/import/uploads/{id}/complete` starts the import. Chunking keeps every request below
   the 10 MB body limit of the Next.js rewrite and of typical reverse proxies.
   Scripts can instead send the whole file to `POST /api/import` (multipart, streamed to disk).
   Both are size-limited by `KURU_MAX_UPLOAD_MB` and return the `import_job` to poll.
2. A FastAPI background task runs `run_import_job` (`services/importer/jobs.py`).
3. Clients poll `GET /api/import/status/{job_id}` for `stage` and `progress` (0–1).

Live progress is held in an in-process registry because SQLite allows only one writer and the
import keeps a write transaction open.

## Package formats

| Version | Collection file | Media map | Media files |
| --- | --- | --- | --- |
| Legacy 1 | `collection.anki2` (schema 11) | JSON | plain |
| Legacy 2 | `collection.anki21` (schema 11) | JSON | plain |
| Latest (Anki ≥ 2.1.50) | `collection.anki21b` (zstd, schema 18) | zstd protobuf | zstd |

Schema 18 stores note types, decks and presets as protobuf blobs. Kuru decodes the few fields it
needs with a small wire-format reader (`services/importer/protobuf.py`); field numbers follow Anki's
`proto/anki/{notetypes,decks,deck_config,import_export}.proto`.

## Mapping

| Anki | Kuru |
| --- | --- |
| deck options group | `deck_config` preset (limits, steps, retention, FSRS weights, bury, autoplay) |
| deck (`A::B`) | `deck`; missing parents are created; filtered decks are dissolved (cards return to `odid`) |
| note type | `note_type` with fields, templates and CSS |
| note | `note` (matched by `guid` on re-import) |
| card | `card` — see scheduling below |
| revlog | `review_log` (rating = ease, kind = type, Anki ivl/lastIvl/factor kept) |
| media | content-addressed blobs in `data/media/<sha256[:2]>/<sha256>` |

### Presets

Anki's built-in options group (*Default*, id 1, which Anki does not allow deleting) is merged into
Kuru's own Default preset instead of being imported as a second "Default"; every other options group
becomes its own preset. Exports only contain the user's presets when **"Include deck presets"** is
enabled in Anki's export dialog — otherwise Anki writes just its stock Default (20 new / 200 reviews
per day), and that is what gets imported.

### Scheduling state

* **New** cards keep their position (`due`).
* **Learning / relearning** cards keep their due timestamp; the current step is derived from `left`.
* **Review** cards' day-number dues are converted with the collection creation time (`crt`).
* **FSRS memory** (`stability`, `difficulty`, last review) comes from the card's `data` column when
  Anki already used FSRS. Otherwise it is obtained by replaying the card's revlog through FSRS-6
  (due dates stay as Anki scheduled them). Cards without any history get an estimate from the SM-2
  interval and ease.
* Suspension and flags are preserved. Buried cards are imported unburied.
* FSRS-4.5/5 weight vectors are converted to equivalent FSRS-6 vectors (ADR 0001).

### Re-import

Re-importing updates presets, note types and note content. Card scheduling is replaced only for
cards that have not been reviewed in Kuru since; review-log entries are de-duplicated by Anki id.

## Performance

A synthetic collection with 30 000 cards and 300 000 reviews (all requiring a revlog replay)
imports in about 6 seconds on an Apple M-series laptop.
