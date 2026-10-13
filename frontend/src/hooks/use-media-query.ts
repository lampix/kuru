"use client";

import { useCallback, useSyncExternalStore } from "react";

export function useMediaQuery(query: string, serverValue = false): boolean {
  const subscribe = useCallback(
    (callback: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", callback);
      return () => list.removeEventListener("change", callback);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => serverValue,
  );
}

export const useDarkMode = () => useMediaQuery("(prefers-color-scheme: dark)");
