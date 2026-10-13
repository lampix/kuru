# Contributing to Kuru

Thanks for your interest in improving Kuru! This document explains how the repository is organised and
what we expect from contributions.

## Repository layout

| Path | Contents |
| --- | --- |
| `backend/` | FastAPI service (Python, managed with [uv](https://docs.astral.sh/uv/)) |
| `frontend/` | Next.js PWA (TypeScript, managed with [pnpm](https://pnpm.io/)) |
| `docs/` | Architecture docs, ADRs and guides |

## Prerequisites

- Python ≥ 3.13 and `uv`
- Node.js ≥ 22 and `pnpm`

## Workflow

1. Fork and create a feature branch from `main`.
2. Keep changes focused; one logical change per commit.
3. Use [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, `chore:`, …).
4. Make sure all checks pass locally before opening a pull request:

   ```bash
   # backend
   cd backend && uv run ruff check && uv run ruff format --check && uv run mypy && uv run pytest
   # frontend
   cd frontend && pnpm lint && pnpm typecheck && pnpm test
   ```

5. Significant architectural changes need an [ADR](docs/adr/README.md).

## Translations

UI strings live in `frontend/messages/{en,de}.json`. Every key must exist in all locales — the test suite
checks this. See [docs/i18n.md](docs/i18n.md).

## Code style

- **Python:** `ruff` (lint + format), `mypy --strict`, type hints everywhere, docstrings on public APIs.
- **TypeScript:** strict mode, ESLint, Prettier. Prefer React Server Components; mark client components explicitly.

## Reporting bugs

Please include the Kuru version, browser/OS, and — for import issues — the Anki version used to create
the export. Never attach personal collections publicly; a minimal reproducing deck is ideal.
