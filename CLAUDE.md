# Technical Design Document: Custom SRS PWA (Anki & FSRS Compatible)

## 1. Executive Summary
This document outlines the architecture and technical specifications for a custom, cross-platform Spaced Repetition System (SRS) Progressive Web Application (PWA). The primary goal is to provide a modern, iOS-native aesthetic replacement for Anki clients while preserving **100% state continuity** (card progress, review history via `revlog`, and deck parameters) from existing Anki collections (`.apkg` or `.colpkg`). 

The core scheduling engine uses the modern **FSRS v5** (Free Spaced Repetition Scheduler) algorithm. The application features built-in internationalization (i18n) supporting English and German, adhering strictly to iOS Human Interface Guidelines (HIG).

---

## 2. System Architecture Overview

The system follows a decoupled, offline-first client-server architecture:

* **Backend:** Python (FastAPI) serving as the orchestration engine, handling SQLite database persistence, file processing, Anki extraction/migration pipelines, and FSRS math calculations.
* **Frontend:** Next.js (TypeScript) PWA leveraging Service Workers and IndexedDB (`Dexie.js`) for full offline-first review execution on mobile and desktop browsers.
* **Processing Model:** Asynchronous execution via FastAPI `BackgroundTasks` / `asyncio` for import processing, avoiding complex Message Queues (e.g., Celery, RabbitMQ) to keep overhead minimal.

```
+---------------------------------------------------------------------------------+
|                                FRONTEND (PWA)                                   |
|  +--------------------------+   +---------------------+   +------------------+  |
|  | Next.js App Router (TS)  |   | Service Worker      |   | IndexedDB        |  |
|  | iOS HIG Design System    | <-> (Offline Cache &    | <-> (Local Card DB & |  |
|  | i18n Engine (System/Man) |   | Sync Manager)       |   | Queue / Outbox)  |  |
|  +--------------------------+   +---------------------+   +------------------+  |
+--------------------------------------^------------------------------------------+
                                       | REST API (JSON)
+--------------------------------------v------------------------------------------+
|                                BACKEND (Python)                                 |
|  +--------------------+   +---------------------------+   +------------------+  |
|  | FastAPI Router     |   | Anki Importer Engine      |   | FSRS v5 Engine   |  |
|  | (REST + Media)     |   | (.apkg/.colpkg + revlog)  |   | (PyPI fsrs)      |  |
|  +--------------------+   +---------------------------+   +------------------+  |
|            |                            |                                       |
|            |               +--------------------------+                         |
|            +-------------> | Async Background Tasks   |                         |
|                            +--------------------------+                         |
|                                         |                                       |
|                            +--------------------------+                         |
|                            | SQLite Database          |                         |
|                            +--------------------------+                         |
+---------------------------------------------------------------------------------+
```

---

## 3. Tech Stack & Key Modules

### 3.1 Backend (Python)
* **Framework:** `FastAPI` (Async REST API with automatic OpenAPI generation).
* **Database / ORM:** `SQLite` via `SQLModel` / `SQLAlchemy` (lightweight, embedded persistence).
* **SRS Engine:** `fsrs` (Official PyPI package implementing FSRS-v5 algorithm).
* **Anki Extraction:** `zipfile`, `sqlite3`, `pydantic` (for extracting `.apkg` / `.colpkg` ZIP archives, parsing `collection.anki21` / `collection.media`, and reconstructing `revlog` entries).
* **Async Processing:** FastAPI native `BackgroundTasks` / `asyncio` worker routines.

### 3.2 Frontend (Next.js PWA)
* **Framework:** `Next.js` (App Router, TypeScript).
* **Styling:** `Tailwind CSS` + `shadcn/ui` (customized to replicate iOS Human Interface Guidelines).
* **Icons:** `Lucide React` (styled to match Apple SF Symbols).
* **Internationalization:** `next-intl` or custom React Context i18n provider.
* **Offline Storage:** `@ducanh2912/next-pwa` + `Dexie.js` (IndexedDB wrapper for offline card queues).
* **Media Management:** HTML5 Audio API wrapper with pre-buffering support for fluid playback.

---

## 4. Anki State Import & Migration Pipeline

Rather than importing raw card texts alone, the pipeline extracts the entire history and state representation of the user's learning journey.

### 4.1 File Upload & Async Processing Workflow
1. **User Action:** The user uploads an `.apkg` or `.colpkg` file via the Settings menu (`/settings/import`).
2. **Immediate API Response:** FastAPI receives the file upload, saves it to a temporary storage buffer, triggers an asynchronous `BackgroundTask`, and immediately returns an import job ID with status `processing`.
3. **Async Extraction:**
   * Unzips archive and reads `collection.anki21` (SQLite).
   * Maps notes, fields, templates, media mapping files (`collection.media`), and cards.
   * **`revlog` Reconstruction:** Iterates through every historical review log entry (`id`, `cid`, `usn`, `ease`, `ivl`, `lastIvl`, `factor`, `time`, `type`).
   * Passes historical logs to the `fsrs` Python module to compute current card Stability ($S$), Difficulty ($D$), and Retrievability ($R$).
   * Updates card states in the SQLite database with their precise due date, FSRS parameters, and historical memory depth.
4. **Progress Monitoring:** Frontend polls `GET /api/import/status/{job_id}` to render progress bars and completion status in real-time.

---

## 5. Deck Configuration Engine

The application provides Anki-level configuration depth without UI clutter, utilizing structured iOS grouped tables:

### Configurable Parameters:
1. **FSRS Scheduling Parameters:**
   * Target Retention Rate (e.g., `0.90` for 90% target memory retention).
   * Maximum Interval Cap (e.g., 3650 days).
   * Custom FSRS Weights Vector ($w_0 \dots w_{18}$) with auto-tune triggers based on `revlog`.
2. **Review & Daily Limits:**
   * New cards per day limit (e.g., 10).
   * Maximum review cards per day limit (e.g., 200).
   * Insertion order (Sequential by Creation / Random).
3. **Card & Media Behavior:**
   * Bury related new cards / reviews until the next day.
   * Auto-play audio on flip toggle.
   * Show answer automatically timer.

---

## 6. Internationalization (i18n) & Localization Architecture

To deliver an accessible experience across languages, the app implements a robust i18n subsystem.

### 6.1 Requirements & Fallback Logic
* **Supported Languages:** German (`de`) and English (`en`).
* **AI Translation Generation:** Static UI strings (labels, settings headers, tooltips, dialogs) are generated via AI and stored in JSON translation dictionaries (`de.json`, `en.json`).
* **Detection & Fallback Cascade:**
  1. **Manual User Override:** If set in Settings (e.g., explicitly forced to `de` or `en`), override everything.
  2. **System/OS Preference:** If no manual setting exists, detect system language (`navigator.language` / `Accept-Language` header).
  3. **Default Fallback:** If the system language is neither German nor English (e.g., French, Spanish, Japanese), fall back to **English (`en`)**.

### 6.2 Data Schema for Translation Strings (`locales/de.json` & `locales/en.json`)
```json
{
  "common": {
    "save": "Speichern",
    "cancel": "Abbrechen"
  },
  "review": {
    "again": "Nochmal",
    "hard": "Schwer",
    "good": "Gut",
    "easy": "Einfach"
  },
  "settings": {
    "importTitle": "Anki-Sammlung importieren",
    "language": "Sprache",
    "languageSystem": "Systemstandard"
  }
}
```

---

## 7. Offline-First PWA Architecture

1. **Initial Sync (Online):**
   * App fetches due cards and deck parameters from `GET /api/decks/{id}/due`.
   * Service Worker caches associated media assets (`.mp3`, `.png`) into browser `CacheStorage`.
   * Cards and HTML/CSS templates populate `IndexedDB`.
2. **Offline Review Execution:**
   * Review cards offline using IndexedDB datasets.
   * Card answers calculate new FSRS intervals locally.
   * Review logs (`rating`, `timestamp`, `elapsed_time`) append to an IndexedDB sync queue (`outbox`).
3. **Re-synchronization:**
   * Service Worker listens for network reconnect (`online` event).
   * Flushes `outbox` queue to `POST /api/sync/reviews`.
   * Backend updates SQLite DB and synchronizes overall review state.

---

## 8. UI/UX Design Strategy (iOS HIG Blueprint)

The interface avoids cluttered software menus, adhering to Apple’s native design language across design iterations:

### 8.1 Key iOS Design Patterns Applied
* **Grouped List Layouts:** In-settings containers feature rounded list cards on light gray backgrounds (`bg-[systemGroupedBackground]`).
* **Segmented Controls:** Crisp iOS-style toggles for deck options and language selectors.
* **Large Title Navigation Bars:** Clear, bold section headers that collapse gracefully during scroll events.
* **Card Canvas Design:** Centered study view with smooth spring-animation card flips, audio play buttons, and colored bottom action buttons (Red, Orange, Blue, Green) displaying precise FSRS intervals (`< 10m`, `2d`, `8.4m`, `1.8y`).

---

## 9. Modular Extensibility (Plugin Architecture)

To support future deck-specific features without polluting the core code:
* **Hook System:** An abstraction layer in the rendering pipeline (`CardRenderer.tsx`) for template filters.
* **Future Plugins:** Support for specialized decks, such as **JLAB Kanji replacement filters** (dynamically switching Kana/Kanji based on learned Heisig frames) or Yomitan dictionary integrations.

---

## 10. Summary & Implementation Steps

1. **Phase 1 (Backend Core):** Set up FastAPI, SQLite schema, `fsrs` calculation endpoints, and the async `.apkg` / `revlog` importer module.
2. **Phase 2 (Frontend Scaffold):** Initialize Next.js PWA, set up Tailwind CSS iOS HIG variables, and implement `next-intl` i18n logic with German and English dictionaries.
3. **Phase 3 (Offline & Sync):** Wire up `Dexie.js` IndexedDB offline queue and Service Worker media caching.
4. **Phase 4 (UI Refinement):** Complete multiple UI iteration passes for iOS native aesthetic compliance.
---

## 11. Implementation Notes (deviations from this document)

* **FSRS-6** (21 weights) is used instead of FSRS v5, as the current official libraries implement it — see `docs/adr/0001-fsrs-6.md`.
* **Serwist** (`@serwist/next`) replaces the unmaintained `@ducanh2912/next-pwa` — see `docs/adr/0002-serwist.md`.
* v1 is **single-user**, with per-row `user_id` ownership for future multi-user support — see `docs/adr/0003-single-user-with-ownership.md`.
* Scheduling runs on the client (`ts-fsrs`) for every answer; the server replays the revlog as source of truth — see `docs/adr/0004-client-scheduling-server-truth.md`.
* Locale lives in the URL (`/en`, `/de`), pages are static and there is no `proxy.ts` — see `docs/adr/0005-static-locale-routing.md`.
* Imports are uploaded in resumable chunks — see `docs/adr/0006-chunked-uploads.md`.
* Tooling: `uv` for Python, `pnpm` for the frontend; `scripts/check.sh` runs every check.
