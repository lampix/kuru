import { defineRouting } from "next-intl/routing";

export const locales = ["en", "de", "fr", "es", "it"] as const;
export type AppLocale = (typeof locales)[number];

/** Cookie holding a *manual* language override (set in Settings, absent for "System Default"). */
export const LOCALE_OVERRIDE_COOKIE = "kuru-locale";

export const routing = defineRouting({
  locales,
  defaultLocale: "en",
  localePrefix: "always",
  // Detection happens on `/` (app/(root)/page.tsx): override cookie → system languages → English.
  localeDetection: false,
  localeCookie: false,
});
