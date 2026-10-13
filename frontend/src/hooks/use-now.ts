"use client";

import { useSyncExternalStore } from "react";

interface Clock {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => Date;
}

function createClock(intervalMs: number): Clock {
  let now: Date | null = null;
  let timer: ReturnType<typeof setInterval> | undefined;
  const listeners = new Set<() => void>();
  return {
    subscribe(listener) {
      listeners.add(listener);
      timer ??= setInterval(() => {
        now = new Date();
        listeners.forEach((l) => l());
      }, intervalMs);
      return () => {
        listeners.delete(listener);
        if (!listeners.size) {
          clearInterval(timer);
          timer = undefined;
        }
      };
    },
    getSnapshot: () => (now ??= new Date()),
  };
}

const clocks = new Map<number, Clock>();
const getClock = (intervalMs: number) => {
  let clock = clocks.get(intervalMs);
  if (!clock) clocks.set(intervalMs, (clock = createClock(intervalMs)));
  return clock;
};
const serverSnapshot = () => null;

/**
 * A ticking clock. Returns `null` while prerendering (reading the time during a prerender is an
 * error with Cache Components) and the current time, refreshed every `intervalMs`, on the client.
 */
export function useNow(intervalMs = 30_000): Date | null {
  const clock = getClock(intervalMs);
  return useSyncExternalStore(clock.subscribe, clock.getSnapshot, serverSnapshot);
}
