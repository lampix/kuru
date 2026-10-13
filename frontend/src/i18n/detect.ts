import { type AppLocale, locales, routing } from "./routing";

/**
 * Kuru's language cascade (design doc §6.1):
 *   1. manual override (Settings)
 *   2. system preference (`Accept-Language` / `navigator.languages`)
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

/** Parse an `Accept-Language` header into tags ordered by quality. */
export function parseAcceptLanguage(header: string | null): string[] {
  if (!header) return [];
  return header
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params.find((p) => p.trim().startsWith("q="));
      return { tag: tag ?? "", q: q ? Number(q.trim().slice(2)) : 1 };
    })
    .filter((entry) => entry.tag && entry.tag !== "*" && !Number.isNaN(entry.q))
    .sort((a, b) => b.q - a.q)
    .map((entry) => entry.tag);
}
