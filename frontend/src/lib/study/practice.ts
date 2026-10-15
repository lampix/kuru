/**
 * Practice sessions (custom study, "preview" behaviour like Anki's filtered decks without
 * rescheduling). Nothing here touches the real schedule: answers only decide whether a card is
 * shown again in this session.
 *
 * - Again → again in ~1 minute
 * - Hard  → again in ~10 minutes
 * - Good / Easy → done for this session
 */

import type { LocalCard, LocalReview } from "@/lib/db";
import { Rating } from "@/lib/fsrs";

const DAY_MS = 86_400_000;

/** How long a card waits before it is shown again in a practice session. */
export const PRACTICE_DELAY_MS: Readonly<Record<Rating, number | null>> = {
  [Rating.Again]: 60_000,
  [Rating.Hard]: 600_000,
  [Rating.Good]: null,
  [Rating.Easy]: null,
};

/**
 * Cards of the given decks that were answered *Again* within the last `days` days, most recently
 * forgotten first. Suspended cards are skipped.
 */
export function forgottenCards(
  cards: readonly LocalCard[],
  reviews: readonly LocalReview[],
  deckIds: ReadonlySet<number>,
  days: number,
  now: Date,
): LocalCard[] {
  const since = now.getTime() - days * DAY_MS;
  const lastLapse = new Map<number, number>();
  for (const review of reviews) {
    if (review.rating !== Rating.Again) continue;
    const at = Date.parse(review.reviewed_at);
    if (at < since) continue;
    lastLapse.set(review.card_id, Math.max(at, lastLapse.get(review.card_id) ?? 0));
  }
  return cards
    .filter((card) => !card.suspended && deckIds.has(card.deck_id) && lastLapse.has(card.id))
    .sort((a, b) => lastLapse.get(b.id)! - lastLapse.get(a.id)! || a.id - b.id);
}

export interface PracticeItem {
  card: LocalCard;
  /** Epoch milliseconds from which the card may be shown again. */
  dueAt: number;
}

/** Immutable session state (snapshots double as undo history). */
export interface PracticeQueue {
  items: readonly PracticeItem[];
}

export function createPracticeQueue(cards: readonly LocalCard[], now: Date): PracticeQueue {
  return { items: cards.map((card) => ({ card, dueAt: now.getTime() })) };
}

/** The card to show next: the first one that is due, else the one waiting the shortest. */
export function nextPractice(queue: PracticeQueue, now: Date): LocalCard | null {
  const due = queue.items.find((item) => item.dueAt <= now.getTime());
  if (due) return due.card;
  let earliest: PracticeItem | null = null;
  for (const item of queue.items) if (!earliest || item.dueAt < earliest.dueAt) earliest = item;
  return earliest?.card ?? null;
}

/** Apply an answer: Good/Easy finish the card, Again/Hard move it to the back with a delay. */
export function answerPractice(
  queue: PracticeQueue,
  cardId: number,
  rating: Rating,
  now: Date,
): PracticeQueue {
  const item = queue.items.find((i) => i.card.id === cardId);
  const rest = queue.items.filter((i) => i.card.id !== cardId);
  const delay = PRACTICE_DELAY_MS[rating];
  if (!item || delay === null) return { items: rest };
  return { items: [...rest, { card: item.card, dueAt: now.getTime() + delay }] };
}

/** Remove a card (e.g. after suspending or burying it). */
export function removePractice(queue: PracticeQueue, cardId: number): PracticeQueue {
  return { items: queue.items.filter((i) => i.card.id !== cardId) };
}
