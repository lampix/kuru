# 0005 — Locale in the URL, no request proxy

- **Status:** Accepted
- **Date:** 2026-10-13

## Context
Locale detection is commonly done in Next.js middleware (`proxy.ts`). Two problems appeared:
pages that read cookies/headers become dynamic under Cache Components (and cannot be precached for
offline use), and a configured proxy makes Next.js buffer request bodies (10 MB limit by default).

## Decision
* Every page lives under `app/[locale]` and is statically generated for each locale; the locale is
  read with `next/root-params`.
* `/` is a static page that resolves the locale on the client (override cookie → `navigator.languages`
  → English) and redirects.
* There is no `proxy.ts`.

## Consequences
* The complete UI is precacheable; `/` (the PWA start URL) works offline.
* Locale-less deep links other than `/` are not redirected (the app never generates them).
