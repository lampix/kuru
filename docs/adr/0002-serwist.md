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

## Consequences
The service worker is authored in TypeScript (`src/app/sw.ts`) and compiled at build time.
