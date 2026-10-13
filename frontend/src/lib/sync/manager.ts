"use client";

/**
 * Orchestrates synchronisation in the browser: runs on start-up, when the connection returns,
 * when the app becomes visible, periodically, and shortly after new answers. Exposes a small
 * observable status for the UI.
 */

import { ApiError, NetworkError } from "@/lib/api/client";
import { META, db, getMeta } from "@/lib/db";

import { runSync } from "./engine";
import { flushOutbox } from "./outbox";

export type SyncPhase = "idle" | "syncing" | "offline" | "error" | "unauthorized";

export interface SyncStatus {
  phase: SyncPhase;
  lastSync: string | null;
  pending: number;
  error: string | null;
}

const PERIOD_MS = 5 * 60 * 1000;
const FLUSH_DELAY_MS = 3000;
const OUTBOX_SYNC_TAG = "kuru-outbox";

export const INITIAL_STATUS: SyncStatus = {
  phase: "idle",
  lastSync: null,
  pending: 0,
  error: null,
};

let status: SyncStatus = INITIAL_STATUS;
const listeners = new Set<() => void>();
let running: Promise<void> | null = null;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let started = false;

function update(patch: Partial<SyncStatus>) {
  status = { ...status, ...patch };
  listeners.forEach((listener) => listener());
}

export const syncStatus = {
  get: () => status,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

async function refreshPending() {
  update({ pending: await db.outbox.count() });
}

function handleError(error: unknown) {
  if (error instanceof NetworkError || (typeof navigator !== "undefined" && !navigator.onLine)) {
    update({ phase: "offline", error: null });
  } else if (error instanceof ApiError && error.isUnauthorized) {
    update({ phase: "unauthorized", error: error.message });
  } else {
    update({ phase: "error", error: error instanceof Error ? error.message : String(error) });
  }
}

/** Run a full sync (coalesces concurrent calls). */
export function syncNow(options: { full?: boolean } = {}): Promise<void> {
  if (running) return running;
  running = (async () => {
    update({ phase: "syncing", error: null });
    try {
      const report = await runSync(db, options);
      update({ phase: "idle", lastSync: report.serverTime });
    } catch (error) {
      handleError(error);
    } finally {
      await refreshPending();
      running = null;
    }
  })();
  return running;
}

/** Upload queued answers soon (debounced). Falls back to Background Sync when offline. */
export function scheduleFlush(): void {
  void refreshPending();
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(async () => {
    flushTimer = null;
    if (running) return;
    try {
      await flushOutbox(db);
      if (status.phase === "offline") update({ phase: "idle" });
    } catch (error) {
      handleError(error);
      await registerBackgroundSync();
    } finally {
      await refreshPending();
    }
  }, FLUSH_DELAY_MS);
}

async function registerBackgroundSync() {
  try {
    const registration = await navigator.serviceWorker?.ready;
    const sync = (
      registration as ServiceWorkerRegistration & {
        sync?: { register(tag: string): Promise<void> };
      }
    )?.sync;
    await sync?.register(OUTBOX_SYNC_TAG);
  } catch {
    // Background Sync is unsupported (Safari, Firefox): the online listener covers it.
  }
}

/** Install listeners; safe to call more than once. */
export function startSyncManager(): () => void {
  if (started) return () => undefined;
  started = true;
  void getMeta<string>(META.lastSync).then((lastSync) => update({ lastSync: lastSync ?? null }));
  void refreshPending();
  const onOnline = () => void syncNow();
  const onOffline = () => update({ phase: "offline" });
  const onVisible = () => {
    if (document.visibilityState === "visible") void syncNow();
  };
  window.addEventListener("online", onOnline);
  window.addEventListener("offline", onOffline);
  document.addEventListener("visibilitychange", onVisible);
  const timer = setInterval(() => void syncNow(), PERIOD_MS);
  if (navigator.onLine) void syncNow();
  else update({ phase: "offline" });
  return () => {
    started = false;
    window.removeEventListener("online", onOnline);
    window.removeEventListener("offline", onOffline);
    document.removeEventListener("visibilitychange", onVisible);
    clearInterval(timer);
  };
}
