/**
 * Uploading queued reviews. Used by the page *and* the service worker (Background Sync), so it
 * must not depend on React or `window`.
 */

import { api } from "@/lib/api/client";
import type { CardMemory } from "@/lib/api/types";
import { type KuruDatabase, type LocalCard } from "@/lib/db";

const BATCH = 500;

export interface FlushResult {
  sent: number;
  rejected: number;
}

/** Copy the server's authoritative memory state onto a local card. */
export function applyMemory(card: LocalCard, memory: CardMemory): LocalCard {
  return {
    ...card,
    state: memory.state,
    step: memory.step,
    stability: memory.stability,
    difficulty: memory.difficulty,
    due: memory.due,
    last_review: memory.last_review,
    reps: memory.reps,
    lapses: memory.lapses,
    suspended: memory.suspended,
    buried_until: memory.buried_until,
  };
}

export async function flushOutbox(db: KuruDatabase): Promise<FlushResult> {
  const result: FlushResult = { sent: 0, rejected: 0 };
  for (;;) {
    const batch = await db.outbox.orderBy("created_at").limit(BATCH).toArray();
    if (!batch.length) return result;
    const response = await api.sync.pushReviews(
      batch.map(({ id, card_id, rating, reviewed_at, duration_ms }) => ({
        id,
        card_id,
        rating,
        reviewed_at,
        duration_ms,
      })),
    );
    await db.transaction("rw", db.outbox, db.cards, async () => {
      const done = [
        ...response.accepted,
        ...response.duplicates,
        ...Object.keys(response.rejected),
      ];
      await db.outbox.bulkDelete(done);
      // Only overwrite cards without further pending reviews (those are newer locally).
      const pending = new Set((await db.outbox.toArray()).map((entry) => entry.card_id));
      for (const memory of response.cards) {
        if (pending.has(memory.card_id)) continue;
        const card = await db.cards.get(memory.card_id);
        if (card) await db.cards.put(applyMemory(card, memory));
      }
    });
    result.sent += response.accepted.length + response.duplicates.length;
    result.rejected += Object.keys(response.rejected).length;
    if (batch.length < BATCH) return result;
  }
}
