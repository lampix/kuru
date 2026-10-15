# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Fixed
- Audio auto-play was sometimes cut off right away when the next card uses the same sound (e.g.
  the Hiragana and Katakana cards of one note): pre-buffering reset the playing audio.

## [0.4.0] - 2026-10-15

### Added
- French, Spanish and Italian translations. "System Default" picks them from the device language.

### Changed
- Settings: the language is chosen from an iOS-style pop-up menu (languages named in themselves);
  the activity calendar starts weeks on Monday in every language except English.

## [0.3.0] - 2026-10-15

### Added
- Deck overview: tapping a deck shows today's new / learning / review counts with a "Study" button
  (or the "all done" celebration), sub-decks and deck options.
- Custom study: **review forgotten cards** of the last 1–30 days as a practice session — Again and
  Hard bring a card back in the session, Good and Easy finish it. Practice never changes due dates,
  daily limits or statistics, and works offline.
- Statistics: "Reviews per Day" switches between a calendar-year heat map (default), a calendar month
  and the last 30 days; year and month can be stepped back to the first review
  (`GET /api/stats/activity`).
- Statistics: every stability and difficulty bar is labelled (stability in localized units, exact
  ranges on tap) and both charts have an info button explaining what they show.

### Changed
- The device keeps 30 days of review history (previously two study days) and fetches the whole gap
  since the last sync.

### Fixed
- Study screen header buttons have tooltips (Close, Undo, More); the close button was announced as
  "Congratulations!" to screen readers.
- Clickable rows and buttons show a pointer cursor and a hover highlight on desktop.
- Practice sessions no longer offer "Bury" / "Suspend", which would change the card outside the
  session.
- The "Source Code" row in Settings is clickable across its full width (it opens in a new tab),
  like the other rows.

## [0.2.0] - 2026-10-14

### Added
- "Delete Deck" at the bottom of a deck's options, with a confirmation that states how many cards
  (and sub-decks) will be deleted permanently.

### Changed
- Deck options save automatically (iOS Settings style) with a "Saved" confirmation; the Cancel/Save
  bar buttons are replaced by a back arrow. Number fields no longer snap to 0 while retyping.
- The import hint explains that Anki must export deck presets for options to carry over.
- Presets can only be deleted from the preset list (not from a deck's options) and always ask for
  confirmation, naming the preset their decks switch to. The Default preset cannot be deleted.

### Fixed
- Audio buttons in the card browser's card info did not play anything.
- Deleting a deck also removes notes left without cards (as in Anki) and uses bulk deletes.
- Importing no longer duplicates the "Default" preset: Anki's built-in options group is merged into
  Kuru's Default; existing duplicates are merged by a database migration.
- Imports of collections from newer Anki versions failed on newer SQLite builds ("no query
  solution") because Anki's `unicase` collation was not defined.
- Settings → About always showed version 0.1.0; it now shows the installed version.

## [0.1.0] - 2026-10-14

### Added
- FastAPI backend with SQLite (SQLModel, Alembic), single-user authentication with optional token.
- FSRS-6 scheduling (`py-fsrs`) with FSRS-4.5/5 weight migration, deterministic interval fuzz,
  review-log replay, undo and optional parameter optimisation.
- Anki import for `anki2`, `anki21` and `anki21b` packages: presets, decks, note types, notes, cards,
  review log and media, with resumable chunked uploads and idempotent re-imports.
- Deck presets, daily study queue, deck tree, card actions, statistics and offline sync API.
- Next.js PWA with iOS design system, English/German UI, offline reviewing (IndexedDB outbox,
  Serwist service worker), Anki template renderer with plugin hooks, review screen, import screen,
  deck options, card browser and statistics.
- Docker images, docker-compose stack and GitHub Actions CI.
- Proxmox VE LXC install script in the community-scripts.org format (`proxmox/`), updatable with
  `update` inside the container.
- Release workflow publishing prebuilt amd64/arm64 bundles for tags `vX.Y.Z`
  (`scripts/build-release.sh`).
