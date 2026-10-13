# Roadmap

## v1 (in progress)

- [ ] Backend core: FastAPI, SQLite schema, migrations
- [ ] FSRS-6 scheduling engine & revlog replay
- [ ] Anki `.apkg` / `.colpkg` import incl. revlog and media
- [ ] Deck presets, daily limits, queue building
- [ ] Offline sync API
- [ ] Next.js PWA with iOS HIG design system and en/de i18n
- [ ] Anki template renderer with plugin hooks
- [ ] Review screen with FSRS interval previews
- [ ] Offline reviews (IndexedDB outbox, service worker media cache)
- [ ] Import UI & deck options
- [ ] Deck browser, statistics, card browser
- [ ] Docker deployment & CI

## Later

- **Multi-user accounts** — swap the single-user `AuthProvider` for real authentication (sessions / OIDC);
  the schema already scopes every row by `user_id`.
- **`.apkg` export** — write collections back in Anki format (ids, guids and revlog are preserved for this).
- **AnkiWeb / Anki sync protocol** — two-way sync using the stored `usn`/`mod` metadata.
- **Note editor** — create and edit notes using imported note types.
- **Template JavaScript** — opt-in execution of deck scripts inside a sandboxed iframe.
- **Plugins** — JLAB Kanji replacement filters, Yomitan dictionary lookups.
