# Roadmap

## v0.1 — first release

- [x] Backend core: FastAPI, SQLite schema, migrations
- [x] FSRS-6 scheduling engine, revlog replay, deterministic fuzz
- [x] Anki `.apkg` / `.colpkg` import (all formats) incl. revlog and media
- [x] Deck presets, daily limits, queue building
- [x] Offline sync API and service worker
- [x] Next.js PWA with iOS HIG design system and en/de i18n
- [x] Anki template renderer with plugin hooks
- [x] Review screen with FSRS interval previews
- [x] Import UI & deck options
- [x] Deck browser, statistics, card browser
- [x] Docker deployment & CI

## Custom study sessions

User-defined extra study sessions, like Anki's *Custom Study*, that run **outside the daily routine**:
they do not use up the day's new/review limits and are kept out of the statistics.

**First iteration (done)**
- [x] Deck overview: tapping a deck shows today's counts, "Study" when cards are due, and the
      custom-study entry point (always available).
- [x] **Review forgotten cards** — cards answered *Again* within the last *N* days (1–30) in a deck
      and its sub-decks.
- [x] **Practice only** (Anki's "preview" behaviour): *Again* → again in 1 min, *Hard* → in 10 min,
      *Good* / *Easy* → done. Due dates, FSRS memory state, limits and statistics stay unchanged;
      nothing is synced.
- [x] Works offline (built from IndexedDB; the device keeps 30 days of reviews).

**Later options** (Anki's other custom study modes)
- Increase today's new-card or review limit
- Study ahead (review cards due in the next *N* days)
- Preview new cards
- Study by card state or tag (cram)
- Optional rescheduling mode for custom sessions

## Card browser

Searching, managing and — step by step — editing cards from the *Browse* tab.

**First iteration: search & filters (done)**
- [x] Filters behind a filter button (sheet), shown as removable chips: card status, deck (incl. sub-decks)
      and card type (Anki's card template, e.g. *Hiragana* / *Katakana* of the same note).
- [x] Anki-style search terms: `deck:`, `card:`, `is:` and `tag:`.
- [x] Coloured status dot and card type on every row.
- [x] Select (filtered) cards and suspend / unsuspend them in bulk, also with Cmd/Ctrl+J.

**Next**
- **Edit cards** — edit the fields and tags of existing notes.
- **Add new cards** — create notes using imported note types.

**Later options**
- Card actions while offline (queued like reviews)
- More bulk actions: move to deck, bury, reset
- Saved searches

## Client API (for third-party apps)

Make the backend ready for clients other than the bundled PWA — native iOS/Android apps, desktop
tools, scripts — so someone can start building one without reading the frontend code. Kuru itself
will not ship native apps.

- **Reachable API docs** — serve Swagger UI / ReDoc / `openapi.json` under `/api` (today they are
  only on the backend port, which deployments don't expose); attach `openapi.json` to each release.
- **API versioning** — `/api/v1/…` with a documented compatibility policy, plus a discovery endpoint
  (server and API version, auth methods, capabilities) a client calls first.
- **Device tokens** — the single user creates, names and revokes per-device API tokens in Settings
  (stored hashed, last-used time shown), optionally paired via QR code. Replaces handing out the
  master `KURU_ACCESS_TOKEN`. Tokens belong to a `user_id`, so they carry over to multi-user.
- **Client guide** (`docs/clients.md`) — connecting and authenticating, the sync protocol step by
  step, scheduling locally with an FSRS library and checking it against `shared/test-vectors`,
  rendering note templates (in a WebView), media download, error format.

User management is *not* a prerequisite: device tokens are enough for a single-user server. Accounts
come with **Multi-user accounts** below and reuse the same tokens.

## Later

- **Multi-user accounts** — a real `AuthProvider` (sessions / OIDC) and user management; the schema
  already scopes every row by `user_id` (ADR 0003).
- **`.apkg` export** — write collections back in Anki format; ids, guids, `usn`/`mod`, raw configs and
  the revlog are preserved for this.
- **AnkiWeb / Anki sync protocol** — two-way sync using the stored metadata.
- **Filtered decks** — saved, user-defined searches as decks (custom study sessions are planned above).
- **Template JavaScript** — opt-in execution of deck scripts in a sandboxed iframe.
- **Plugins** — JLAB Kanji replacement filters, Yomitan dictionary lookups ([plugins](plugins.md)).
- **Text-to-speech** for `{{tts:…}}` fields via the Web Speech API.
- **Shared progress store** (e.g. Redis) to run multiple backend workers.
