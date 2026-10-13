import { defineRouting } from "next-intl/routing";

export const locales = ["en", "de"] as const;
export type AppLocale = (typeof locales)[number];

/** Cookie holding a *manual* language override (set in Settings, absent for "System Default"). */
export const LOCALE_OVERRIDE_COOKIE = "kuru-locale";

export const routing = defineRouting({
  locales,
  defaultLocale: "en",
  localePrefix: "always",
  // Detection is implemented in `src/proxy.ts` to follow Kuru's override → system → English cascade.
  localeDetection: false,
  localeCookie: false,
});
