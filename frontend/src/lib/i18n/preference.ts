"use client";

import { useSyncExternalStore } from "react";

import { LOCALE_OVERRIDE_COOKIE, type AppLocale } from "@/i18n/routing";
import { isLocale, resolveLocale } from "@/i18n/detect";

export type LanguagePreference = "system" | AppLocale;

const STORAGE_KEY = "kuru.language";
const ONE_YEAR = 60 * 60 * 24 * 365;

/** The user's language preference ("system" unless overridden in Settings). */
export function getLanguagePreference(): LanguagePreference {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value && isLocale(value) ? value : "system";
  } catch {
    return "system";
  }
}

/**
 * Persist the preference and return the locale to switch to. The cookie is read by the `/` page
 * when the app starts; "system" removes it so the browser language applies again.
 */
export function setLanguagePreference(preference: LanguagePreference): AppLocale {
  try {
    if (preference === "system") localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, preference);
  } catch {
    // Storage may be unavailable (private mode); the cookie still carries the override.
  }
  document.cookie =
    preference === "system"
      ? `${LOCALE_OVERRIDE_COOKIE}=; path=/; max-age=0; samesite=lax`
      : `${LOCALE_OVERRIDE_COOKIE}=${preference}; path=/; max-age=${ONE_YEAR}; samesite=lax`;
  notifyLanguagePreferenceChange();
  return resolveLocale(preference === "system" ? null : preference, navigator.languages);
}

const CHANGE_EVENT = "kuru:language-change";

function subscribe(callback: () => void): () => void {
  window.addEventListener("storage", callback);
  window.addEventListener(CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(CHANGE_EVENT, callback);
  };
}

/** React hook for the stored preference (server snapshot: "system"). */
export function useLanguagePreference(): LanguagePreference {
  return useSyncExternalStore(subscribe, getLanguagePreference, () => "system");
}

/** Notify subscribers in this tab (the `storage` event only fires in other tabs). */
export function notifyLanguagePreferenceChange(): void {
  window.dispatchEvent(new Event(CHANGE_EVENT));
}
