/// <reference lib="webworker" />
/**
 * Kuru service worker (built by `scripts/build-sw.mjs` with Serwist + esbuild, see ADR 0002).
 *
 * - precaches the app shell: hashed Next.js assets and the prerendered pages of every locale
 * - serves media from the cache filled by the sync engine (`kuru-media-v1`)
 * - falls back to cached pages when offline (`/` is precached and picks the locale itself)
 * - flushes the review outbox via Background Sync where supported
 */

import {
  CacheFirst,
  ExpirationPlugin,
  NetworkFirst,
  NetworkOnly,
  type PrecacheEntry,
  type SerwistGlobalConfig,
  Serwist,
  StaleWhileRevalidate,
} from "serwist";

import { db } from "@/lib/db";
import { MEDIA_CACHE } from "@/lib/sync/media";
import { flushOutbox } from "@/lib/sync/outbox";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope & WorkerGlobalScope;

export const OUTBOX_SYNC_TAG = "kuru-outbox";

const isRsc = (request: Request) =>
  request.headers.get("RSC") === "1" || new URL(request.url).searchParams.has("_rsc");

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  // Pages take their ids from the query string (e.g. /en/study?deck=1); match the cached shell.
  precacheOptions: {
    ignoreURLParametersMatching: [
      /^deck$/,
      /^preset$/,
      /^card$/,
      /^q$/,
      /^custom$/,
      /^days$/,
      /^utm_/,
    ],
  },
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  disableDevLogs: true,
  runtimeCaching: [
    {
      matcher: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith("/api/media/"),
      handler: new CacheFirst({
        cacheName: MEDIA_CACHE,
        plugins: [new ExpirationPlugin({ maxEntries: 20000, maxAgeFrom: "last-used" })],
      }),
    },
    {
      matcher: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith("/api/"),
      handler: new NetworkOnly(),
    },
    {
      matcher: ({ request, sameOrigin }) => sameOrigin && isRsc(request),
      handler: new NetworkFirst({
        cacheName: "kuru-rsc",
        networkTimeoutSeconds: 4,
        plugins: [new ExpirationPlugin({ maxEntries: 200 })],
      }),
    },
    {
      matcher: ({ request, sameOrigin }) => sameOrigin && request.mode === "navigate",
      handler: new NetworkFirst({
        cacheName: "kuru-pages",
        networkTimeoutSeconds: 4,
        plugins: [new ExpirationPlugin({ maxEntries: 100 })],
      }),
    },
    {
      matcher: ({ request }) => ["style", "script", "font", "image"].includes(request.destination),
      handler: new StaleWhileRevalidate({ cacheName: "kuru-assets" }),
    },
  ],
});

interface SyncEvent extends ExtendableEvent {
  tag: string;
}

self.addEventListener("sync", (event) => {
  const syncEvent = event as SyncEvent;
  if (syncEvent.tag === OUTBOX_SYNC_TAG) syncEvent.waitUntil(flushOutbox(db).then(() => undefined));
});

serwist.addEventListeners();
