"use client";

import { useSyncExternalStore } from "react";

/** Card text sizes offered in Settings, as a factor on top of the automatic phone scaling. */
export const CARD_SCALES = [0.7, 0.85, 1, 1.15, 1.3] as const;

const STORAGE_KEY = "kuru.cardScale";
const CHANGE_EVENT = "kuru:card-scale-change";

/** Parse a stored value; anything unknown falls back to 1 (100 %). */
export function parseCardScale(value: string | null): number {
  const scale = Number(value);
  return (CARD_SCALES as readonly number[]).includes(scale) ? scale : 1;
}

/** The user's card text size factor (1 unless changed in Settings). */
export function getCardScale(): number {
  try {
    return parseCardScale(localStorage.getItem(STORAGE_KEY));
  } catch {
    return 1;
  }
}

export function setCardScale(scale: number): void {
  try {
    if (scale === 1) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, String(scale));
  } catch {
    // Storage may be unavailable (private mode); the size stays at 100 %.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(callback: () => void): () => void {
  window.addEventListener("storage", callback);
  window.addEventListener(CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(CHANGE_EVENT, callback);
  };
}

/** React hook for the stored card text size (server snapshot: 1). */
export function useCardScale(): number {
  return useSyncExternalStore(subscribe, getCardScale, () => 1);
}
