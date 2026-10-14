# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- "Delete Deck" at the bottom of a deck's options, with a confirmation that states how many cards
  (and sub-decks) will be deleted permanently.

### Fixed
- Deleting a deck also removes notes left without cards (as in Anki) and uses bulk deletes.
- Importing no longer duplicates the "Default" preset: Anki's built-in options group is merged into
  Kuru's Default; existing duplicates are merged by a database migration.
- Imports of collections from newer Anki versions failed on newer SQLite builds ("no query
  solution") because Anki's `unicase` collation was not defined.

### Changed
- Deck options save automatically (iOS Settings style) with a "Saved" confirmation; the Cancel/Save
  bar buttons are replaced by a back arrow. Number fields no longer snap to 0 while retyping.
- The import hint explains that Anki must export deck presets for options to carry over.
- Presets can only be deleted from the preset list (not from a deck's options) and always ask for
  confirmation, naming the preset their decks switch to. The Default preset cannot be deleted.

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
