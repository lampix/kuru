/** Pre-caching media in CacheStorage so cards render offline (served by the service worker). */

import type { MediaEntry } from "@/lib/api/types";
import { mediaUrl } from "@/lib/render/media";

export const MEDIA_CACHE = "kuru-media-v1";
const CONCURRENCY = 6;

/**
 * Download media that is new or changed since the last run.
 * `known` maps filename → sha256 of what is already cached; the updated map is returned.
 */
export async function cacheMedia(
  manifest: readonly MediaEntry[],
  known: Readonly<Record<string, string>>,
  onProgress?: (done: number, total: number) => void,
): Promise<Record<string, string>> {
  if (typeof caches === "undefined") return { ...known };
  const cache = await caches.open(MEDIA_CACHE);
  const next: Record<string, string> = {};
  const todo: MediaEntry[] = [];
  for (const entry of manifest) {
    if (known[entry.filename] === entry.sha256) next[entry.filename] = entry.sha256;
    else todo.push(entry);
  }
  // Remove files that no longer exist on the server.
  for (const filename of Object.keys(known)) {
    if (!manifest.some((m) => m.filename === filename)) await cache.delete(mediaUrl(filename));
  }
  let done = 0;
  const worker = async () => {
    for (let entry = todo.shift(); entry; entry = todo.shift()) {
      try {
        const response = await fetch(mediaUrl(entry.filename), { credentials: "same-origin" });
        if (response.ok) {
          await cache.put(mediaUrl(entry.filename), response);
          next[entry.filename] = entry.sha256;
        }
      } catch {
        // Offline mid-way: try again on the next sync.
      }
      onProgress?.(++done, done + todo.length);
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return next;
}
