# Kuru

> A modern, offline-first spaced repetition PWA — Anki-compatible, powered by FSRS.

Kuru (来る, "to come") is a self-hosted spaced repetition system with an iOS-native look and feel.
It imports your existing Anki collections (`.apkg` / `.colpkg`) **including the full review history**,
so you keep every bit of progress, and schedules reviews with the modern
[FSRS](https://github.com/open-spaced-repetition) algorithm.

> **Status:** early development. See [the roadmap](docs/roadmap.md).

## Features

- 📥 **Lossless Anki import** — notes, note types, templates, decks, deck presets, media and the complete `revlog`.
- 🧠 **FSRS-6 scheduling** — on the server (`fsrs`) and on the device (`ts-fsrs`) for instant offline answers.
- 📴 **Offline-first PWA** — review without a connection; answers are queued and synced when you're back online.
- 🍏 **iOS Human Interface Guidelines** — grouped lists, segmented controls, large titles, dark mode.
- 🌍 **English & German** — follows your system language, overridable in Settings.
- 🧩 **Plugin hooks** — extend card rendering with custom template filters.

## Quickstart

Documentation for running Kuru will be filled in as components land. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Documentation

| Topic | Link |
| --- | --- |
| Architecture | [docs/architecture.md](docs/architecture.md) |
| Architecture decisions | [docs/adr](docs/adr) |
| Roadmap | [docs/roadmap.md](docs/roadmap.md) |
| Original design document | [CLAUDE.md](CLAUDE.md) |

## License

[MIT](LICENSE)
