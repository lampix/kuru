#!/usr/bin/env bash
# Build the self-contained release bundle used by the Proxmox LXC install (proxmox/).
# Usage: scripts/build-release.sh <version> [out-dir]
#   → <out-dir>/kuru-<version>-linux-<amd64|arm64>.tar.gz
#
# The bundle holds the Next.js standalone server (built for this machine's platform:
# it ships native modules such as sharp) and the backend source with its lockfile;
# the target installs the backend's dependencies with `uv sync --locked`.
set -euo pipefail
cd "$(dirname "$0")/.."

version="${1:?usage: scripts/build-release.sh <version> [out-dir]}"
out_dir="$(mkdir -p "${2:-dist}" && cd "${2:-dist}" && pwd)"

case "$(uname -m)" in
x86_64 | amd64) arch=amd64 ;;
aarch64 | arm64) arch=arm64 ;;
*)
  echo "unsupported architecture: $(uname -m)" >&2
  exit 1
  ;;
esac
[[ "$(uname -s)" == "Linux" ]] || echo "warning: building on $(uname -s); native modules will not run on Linux" >&2

name="kuru-${version}-linux-${arch}"
stage="$(mktemp -d)"
trap 'rm -rf "$stage"' EXIT
root="$stage/kuru"

echo "▶ frontend"
(
  cd frontend
  pnpm install --frozen-lockfile
  # Both services run in the same container: the backend is always on loopback.
  KURU_API_URL="http://127.0.0.1:8000" \
    NEXT_PUBLIC_SOURCE_URL="${KURU_SOURCE_URL:-}" \
    NEXT_TELEMETRY_DISABLED=1 \
    pnpm build
)
mkdir -p "$root/frontend/.next"
cp -R frontend/.next/standalone/. "$root/frontend/"
cp -R frontend/.next/static "$root/frontend/.next/static"
cp -R frontend/public "$root/frontend/public"

echo "▶ backend"
mkdir -p "$root/backend"
cp backend/pyproject.toml backend/uv.lock backend/README.md "$root/backend/"
cp -R backend/src "$root/backend/src"
find "$root/backend" -name __pycache__ -type d -prune -exec rm -rf {} +

echo "$version" >"$root/VERSION"
cp LICENSE "$root/"

tar -C "$stage" -czf "$out_dir/$name.tar.gz" kuru
echo "✓ $out_dir/$name.tar.gz"
