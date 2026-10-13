# 0004 — Client-side scheduling, server-side truth

- **Status:** Accepted
- **Date:** 2026-10-13

## Context
Reviews must work offline and feel instant. At the same time, several devices may review the same
collection, and the server must hold a consistent state.

## Decision
- The client **always** computes the next card state locally with `ts-fsrs` (online and offline alike)
  and appends the review to an IndexedDB outbox with a client-generated UUID.
- The outbox is flushed to `POST /api/sync/reviews`. The server inserts reviews idempotently (by UUID),
  then **replays each affected card's complete revlog in chronological order** with `py-fsrs`, and returns
  the authoritative card states, which overwrite the local ones.

## Consequences
- One code path for online and offline reviewing.
- Concurrent reviews from multiple devices merge naturally by timestamp.
- Minor numerical differences between `ts-fsrs` and `py-fsrs` are corrected on every sync.
