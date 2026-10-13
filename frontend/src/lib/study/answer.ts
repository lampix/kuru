/** Recording answers locally (IndexedDB) and queueing them for the server. */

import { type KuruDatabase, type LocalCard, type LocalReview } from "@/lib/db";
import { CardState, type Rating, type Scheduler } from "@/lib/fsrs";

export interface AnswerRecord {
  reviewId: string;
  before: LocalCard;
  after: LocalCard;
}

const KIND_BY_STATE: Record<number, number> = {
  [CardState.New]: 0,
  [CardState.Learning]: 0,
  [CardState.Review]: 1,
  [CardState.Relearning]: 2,
};

export async function recordAnswer(
  db: KuruDatabase,
  scheduler: Scheduler,
  card: LocalCard,
  rating: Rating,
  durationMs: number,
  at: Date = new Date(),
): Promise<AnswerRecord> {
  const memory = scheduler.review(card, rating, at);
  const after: LocalCard = { ...card, ...memory, buried_until: null };
  const reviewId = crypto.randomUUID();
  const review: LocalReview = {
    id: reviewId,
    card_id: card.id,
    rating,
    reviewed_at: at.toISOString(),
    kind: KIND_BY_STATE[card.state] ?? 1,
    was_new: card.state === CardState.New,
    duration_ms: Math.round(durationMs),
  };
  await db.transaction("rw", db.cards, db.outbox, db.reviews, async () => {
    await db.cards.put(after);
    await db.reviews.put(review);
    await db.outbox.put({
      id: reviewId,
      card_id: card.id,
      rating,
      reviewed_at: review.reviewed_at,
      duration_ms: review.duration_ms,
      created_at: Date.now(),
      attempts: 0,
    });
  });
  return { reviewId, before: card, after };
}

/**
 * Undo an answer. Returns false when the review already reached the server and must be undone
 * online (`DELETE /api/reviews/{id}`).
 */
export async function undoLocal(db: KuruDatabase, record: AnswerRecord): Promise<boolean> {
  return db.transaction("rw", db.cards, db.outbox, db.reviews, async () => {
    const pending = await db.outbox.get(record.reviewId);
    if (!pending) return false;
    await db.outbox.delete(record.reviewId);
    await db.reviews.delete(record.reviewId);
    await db.cards.put(record.before);
    return true;
  });
}
