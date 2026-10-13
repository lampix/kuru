# 0003 — Single-user mode with per-row ownership

- **Status:** Accepted
- **Date:** 2026-10-13

## Context
v1 targets self-hosting for a single learner, but multi-user hosting is on the roadmap.

## Decision
- A `user` table exists from day one; every owned table has a non-null `user_id` foreign key.
- Authentication is abstracted behind an `AuthProvider`. v1 ships `SingleUserAuthProvider`, which
  auto-provisions one user and optionally requires a static bearer token (`KURU_ACCESS_TOKEN`).
- Every query is scoped through the `CurrentUser` dependency.

## Consequences
Adding accounts later only requires a new `AuthProvider` and user-management endpoints — no data migration.
