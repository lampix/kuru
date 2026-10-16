import { api } from "@/lib/api/client";
import { db } from "@/lib/db";
import { applyMemory } from "@/lib/sync/outbox";

export type SuspendAction = "suspend" | "unsuspend";

const CHUNK = 1000;

/**
 * Suspends or unsuspends cards on the server and stores the returned state locally. Needs a
 * connection: card actions are not queued like reviews.
 */
export async function setSuspended(cardIds: readonly number[], action: SuspendAction) {
  for (let i = 0; i < cardIds.length; i += CHUNK) {
    const memories = await api.cardActions(cardIds.slice(i, i + CHUNK), action);
    await db.transaction("rw", db.cards, async () => {
      const cards = await db.cards.bulkGet(memories.map((m) => m.card_id));
      await db.cards.bulkPut(
        memories.flatMap((memory, index) => {
          const card = cards[index];
          return card ? [applyMemory(card, memory)] : [];
        }),
      );
    });
  }
}

/** Anki's Cmd/Ctrl+J: unsuspend when every card is suspended, otherwise suspend. */
export function toggleAction(cards: ReadonlyArray<{ suspended: boolean }>): SuspendAction {
  return cards.every((card) => card.suspended) ? "unsuspend" : "suspend";
}
