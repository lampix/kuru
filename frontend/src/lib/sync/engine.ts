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

  // Reviews from the previous and current study day drive the daily limits.
  const day = studyDay(new Date(), meta.timezone, meta.day_rollover_hour);
  const since = new Date(day.start.getTime() - 24 * 3_600_000).toISOString();
  const recent = await api.sync.reviews(since);
  await db.transaction("rw", db.reviews, async () => {
    await db.reviews.where("reviewed_at").below(since).delete();
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
