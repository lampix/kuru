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

## Later

- **Multi-user accounts** — a real `AuthProvider` (sessions / OIDC) and user management; the schema
  already scopes every row by `user_id` (ADR 0003).
- **`.apkg` export** — write collections back in Anki format; ids, guids, `usn`/`mod`, raw configs and
  the revlog are preserved for this.
- **AnkiWeb / Anki sync protocol** — two-way sync using the stored metadata.
- **Note editor** — create and edit notes using imported note types.
- **Filtered decks** — saved, user-defined searches as decks (custom study sessions are planned above).
- **Template JavaScript** — opt-in execution of deck scripts in a sandboxed iframe.
- **Plugins** — JLAB Kanji replacement filters, Yomitan dictionary lookups ([plugins](plugins.md)).
- **Text-to-speech** for `{{tts:…}}` fields via the Web Speech API.
- **Shared progress store** (e.g. Redis) to run multiple backend workers.
