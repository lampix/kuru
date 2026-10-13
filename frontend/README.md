# Kuru frontend

Next.js (App Router) progressive web app with an iOS Human Interface Guidelines design system.

## Development

```bash
pnpm install
pnpm dev          # http://localhost:3000 — expects the backend on http://127.0.0.1:8000
pnpm test         # Vitest
pnpm lint && pnpm typecheck && pnpm format:check
pnpm build        # production build
```

| Variable       | Default                 | Description                                                   |
| -------------- | ----------------------- | ------------------------------------------------------------- |
| `KURU_API_URL` | `http://127.0.0.1:8000` | Backend origin that `/api/*` is rewritten to (**build time**) |

## Architecture

```
src/
  app/[locale]/          statically generated routes for every locale (en, de)
    (tabs)/              screens with the bottom tab bar: decks, browse, stats, settings
  components/
    ios/                 HIG primitives: NavigationPage (collapsing large title), ListSection/ListRow,
                         SegmentedControl, TabBar, buttons
    ui/                  shadcn/ui primitives restyled with iOS tokens
  i18n/                  next-intl routing, request config and locale detection
  lib/fsrs/              client-side FSRS-6 scheduler (ts-fsrs) + deterministic fuzz shared with the server
  proxy.ts               redirects locale-less URLs using override cookie → Accept-Language → English
messages/{en,de}.json    UI strings
```

- **Cache Components** are enabled. Every page is prerendered per locale (`/en`, `/de`), which keeps
  the app shell cacheable by the service worker. Data comes from IndexedDB in client components, and
  dynamic ids are passed as search parameters (e.g. `/en/study?deck=12`).
- The locale lives in the URL and is read with `next/root-params`; the root layout is
  `app/[locale]/layout.tsx`.
- `/api/*` is rewritten to the backend, so the browser talks to a single origin (cookies, no CORS).
  The proxy matcher excludes `/api` so uploads stream without buffering.
