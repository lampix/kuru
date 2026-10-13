/** Media references: `[sound:…]` tags and relative `src` / CSS `url()` paths. */

import { escapeHtml } from "./html";

const SOUND = /\[sound:([^\]]+)\]/g;
const ABSOLUTE = /^(?:[a-z][a-z0-9+.-]*:|\/\/|\/|#)/i;

export const PLAY_ICON =
  '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M8 5.14v13.72a1 1 0 0 0 1.5.86l11-6.86a1 1 0 0 0 0-1.72l-11-6.86A1 1 0 0 0 8 5.14Z"/></svg>';

/** URL under which the backend serves a media file. */
export function mediaUrl(filename: string): string {
  return `/api/media/${encodeURIComponent(filename)}`;
}

export function isRelativeUrl(url: string): boolean {
  return Boolean(url) && !ABSOLUTE.test(url.trim());
}

/** Filenames of all `[sound:…]` tags, in order. */
export function extractSounds(html: string): string[] {
  return [...html.matchAll(SOUND)].map((m) => m[1]!.trim());
}

/** Replace `[sound:…]` tags with play buttons. */
export function replaceSoundTags(html: string, label = "Play"): string {
  return html.replace(SOUND, (_m, name: string) => {
    const file = escapeHtml(name.trim());
    return `<button type="button" class="kuru-play" data-sound="${file}" aria-label="${escapeHtml(label)}">${PLAY_ICON}</button>`;
  });
}

/** Rewrite relative `url(...)` references in note type CSS (fonts, background images). */
export function rewriteCssUrls(css: string): string {
  return css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (match, quote: string, url: string) =>
    isRelativeUrl(url) ? `url(${quote}${mediaUrl(url.trim())}${quote})` : match,
  );
}
