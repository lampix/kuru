# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

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
