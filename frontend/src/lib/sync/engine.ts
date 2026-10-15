/**
 * Full synchronisation cycle (see `backend/src/kuru/api/routes/sync.py` and ADR 0004):
 * flush outbox → metadata → changed cards → prune deleted cards → recent reviews → media.
 */

import { api } from "@/lib/api/client";
import type { StudyCard } from "@/lib/api/types";
import { META, type KuruDatabase, type LocalCard, getMeta, setMeta } from "@/lib/db";
import { studyDay } from "@/lib/study/time";

import { cacheMedia } from "./media";
import { flushOutbox } from "./outbox";

export function toLocalCard(card: StudyCard): LocalCard {
  return {
    ...card.memory,
    id: card.id,
    note_id: card.note_id,
    deck_id: card.deck_id,
    ord: card.ord,
    note_type_id: card.note_type_id,
    fields: card.fields,
    tags: card.tags,
    position: card.position,
    flags: card.flags,
  };
}

const DAY_MS = 86_400_000;
/** How long reviews are kept on the device (bounds "forgotten in the last N days"). */
export const REVIEW_RETENTION_DAYS = 30;

/**
 * Which reviews to (re)fetch: everything since the last sync (minus a day, for reviews other
 * devices uploaded late) and at least the previous study day, but never more than the retention
 * window. Reviews older than `keepFrom` are dropped locally.
 */
export function reviewWindow(
  now: Date,
  dayStart: Date,
  lastSync: string | null,
): { since: Date; keepFrom: Date } {
  const keepFrom = new Date(now.getTime() - REVIEW_RETENTION_DAYS * DAY_MS);
  const yesterday = dayStart.getTime() - DAY_MS;
  const fromLastSync = lastSync ? Date.parse(lastSync) - DAY_MS : keepFrom.getTime();
  return {
    since: new Date(Math.max(keepFrom.getTime(), Math.min(fromLastSync, yesterday))),
    keepFrom,
  };
}

export interface SyncReport {
  pushed: number;
  pulledCards: number;
  removedCards: number;
  serverTime: string;
}

export async function runSync(
  db: KuruDatabase,
  options: { full?: boolean; media?: boolean } = {},
): Promise<SyncReport> {
  const { sent } = await flushOutbox(db);

  const meta = await api.sync.meta();
  const lastSync = options.full ? null : ((await getMeta<string>(META.lastSync)) ?? null);
  await db.transaction("rw", [db.decks, db.presets, db.noteTypes, db.meta], async () => {
    await db.decks.clear();
    await db.decks.bulkPut(meta.decks);
    await db.presets.clear();
    await db.presets.bulkPut(meta.presets);
    await db.noteTypes.clear();
    await db.noteTypes.bulkPut(meta.note_types);
    await setMeta(META.timezone, meta.timezone);
    await setMeta(META.rolloverHour, meta.day_rollover_hour);
  });

  let pulled = 0;
  let afterId = 0;
  for (;;) {
    const page = await api.sync.cards({ since: lastSync, after_id: afterId, limit: 2000 });
    const pending = new Set((await db.outbox.toArray()).map((entry) => entry.card_id));
    const cards = page.cards.filter((card) => !pending.has(card.id)).map(toLocalCard);
    await db.cards.bulkPut(cards);
    pulled += cards.length;
    if (page.next_after_id === null) break;
    afterId = page.next_after_id;
  }

  const { card_ids } = await api.sync.cardIds();
  const existing = new Set(card_ids);
  const stale = (await db.cards.toCollection().primaryKeys()).filter((id) => !existing.has(id));
  await db.cards.bulkDelete(stale);

  // Recent reviews drive the daily limits (today) and custom study (last 30 days, offline too).
  const now = new Date();
  const day = studyDay(now, meta.timezone, meta.day_rollover_hour);
  const window = reviewWindow(now, day.start, lastSync);
  const recent = await api.sync.reviews(window.since.toISOString());
  await db.transaction("rw", db.reviews, async () => {
    await db.reviews.where("reviewed_at").below(window.keepFrom.toISOString()).delete();
    await db.reviews.bulkPut(recent);
  });

  await setMeta(META.lastSync, meta.server_time);

  if (options.media !== false) {
    const manifest = await api.sync.media();
    const known = (await getMeta<Record<string, string>>(META.mediaManifest)) ?? {};
    await setMeta(META.mediaManifest, await cacheMedia(manifest, known));
  }

  return {
    pushed: sent,
    pulledCards: pulled,
    removedCards: stale.length,
    serverTime: meta.server_time,
  };
}
