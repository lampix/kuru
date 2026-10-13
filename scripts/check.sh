#!/usr/bin/env bash
# Run every check the CI runs. Usage: scripts/check.sh [backend|frontend]
set -euo pipefail
cd "$(dirname "$0")/.."

target="${1:-all}"

if [[ "$target" == "all" || "$target" == "backend" ]]; then
  echo "▶ backend"
  (
    cd backend
    uv run ruff check .
    uv run ruff format --check .
    uv run mypy
    uv run pytest -q
  )
fi

if [[ "$target" == "all" || "$target" == "frontend" ]]; then
  echo "▶ frontend"
  (
    cd frontend
    pnpm lint
    pnpm format:check
    pnpm typecheck
    pnpm test
  )
fi

echo "✓ all checks passed"
