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

## Later

- **Multi-user accounts** — a real `AuthProvider` (sessions / OIDC) and user management; the schema
  already scopes every row by `user_id` (ADR 0003).
- **`.apkg` export** — write collections back in Anki format; ids, guids, `usn`/`mod`, raw configs and
  the revlog are preserved for this.
- **AnkiWeb / Anki sync protocol** — two-way sync using the stored metadata.
- **Note editor** — create and edit notes using imported note types.
- **Filtered decks** and custom study sessions.
- **Template JavaScript** — opt-in execution of deck scripts in a sandboxed iframe.
- **Plugins** — JLAB Kanji replacement filters, Yomitan dictionary lookups ([plugins](plugins.md)).
- **Text-to-speech** for `{{tts:…}}` fields via the Web Speech API.
- **Shared progress store** (e.g. Redis) to run multiple backend workers.
