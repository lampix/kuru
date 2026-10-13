# 0002 — Use Serwist for the service worker

- **Status:** Accepted
- **Date:** 2026-10-13

## Context
The design document names `@ducanh2912/next-pwa`. That package is no longer maintained; its author
continues the work as [Serwist](https://serwist.pages.dev/), which supports the current Next.js App Router
and is the approach referenced by the Next.js PWA guide.

## Decision
Use `@serwist/next` + `serwist` to build the service worker (precaching, runtime caching of media,
offline fallback).

`@serwist/turbopack` serves the worker from a `force-static` route handler, which is incompatible
with Cache Components. Kuru therefore builds the worker after `next build` with `@serwist/build`
and esbuild (`frontend/scripts/build-sw.mjs`), injecting a precache manifest of the hashed assets and
every prerendered page.

## Consequences
The service worker is authored in TypeScript (`frontend/src/sw.ts`) and written to `public/sw.js` by
`pnpm build`. It is not active in `pnpm dev`.
