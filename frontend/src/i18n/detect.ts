import { type AppLocale, locales, routing } from "./routing";

/**
 * Kuru's language cascade (design doc §6.1):
 *   1. manual override (Settings)
 *   2. system preference (`navigator.languages`)
 *   3. English
 */
export function resolveLocale(
  override: string | null | undefined,
  preferred: readonly string[],
): AppLocale {
  if (override && isLocale(override)) return override;
  for (const tag of preferred) {
    const base = tag.trim().toLowerCase().split(/[-_]/)[0];
    if (base && isLocale(base)) return base;
  }
  return routing.defaultLocale;
}

export function isLocale(value: string): value is AppLocale {
  return (locales as readonly string[]).includes(value);
}
