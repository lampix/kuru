# 0006 — Resumable chunked imports

- **Status:** Accepted
- **Date:** 2026-10-13

## Context
Anki collections with media easily exceed hundreds of megabytes. Requests to `/api` pass through
the Next.js rewrite, which buffers bodies up to 10 MB, and typical reverse proxies limit body size
too. Mobile uploads are also prone to interruptions.

## Decision
Browsers upload imports in 5 MB chunks: create (`POST /api/import/uploads`), append
(`PUT …?offset=`; duplicates ignored, wrong offsets → 409 and the client resumes at the server's
position), complete (`POST …/complete`). The single-request multipart endpoint remains for scripts.

## Consequences
Works behind any proxy allowing ≥ 8 MB bodies, retries transparently, and needs no Next.js limits
raised (which would buffer whole archives in memory).
