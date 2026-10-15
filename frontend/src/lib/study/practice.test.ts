import { describe, expect, it } from "vitest";

import type { LocalCard, LocalReview } from "@/lib/db";
import { CardState, Rating } from "@/lib/fsrs";

import {
  PRACTICE_DELAY_MS,
  answerPractice,
  createPracticeQueue,
  forgottenCards,
  nextPractice,
} from "./practice";

const NOW = new Date("2026-10-15T12:00:00Z");
const HOUR = 3_600_000;

const card = (id: number, patch: Partial<LocalCard> = {}): LocalCard => ({
  id,
  card_id: id,
  note_id: id,
  deck_id: 1,
  ord: 0,
  note_type_id: 1,
  fields: ["Q", "A"],
  tags: [],
  position: id,
  flags: 0,
  state: CardState.Review,
  step: null,
  stability: 5,
  difficulty: 5,
  due: NOW.toISOString(),
  last_review: NOW.toISOString(),
  reps: 3,
  lapses: 1,
  suspended: false,
  buried_until: null,
  ...patch,
});

const review = (cardId: number, rating: number, hoursAgo: number): LocalReview => ({
  id: `${cardId}-${hoursAgo}-${rating}`,
  card_id: cardId,
  rating,
  reviewed_at: new Date(NOW.getTime() - hoursAgo * HOUR).toISOString(),
  kind: 1,
  was_new: false,
  duration_ms: 1000,
});

describe("forgottenCards", () => {
  const cards = [
    card(1),
    card(2),
    card(3, { suspended: true }),
    card(4, { deck_id: 2 }), // sub-deck
    card(5, { deck_id: 9 }), // other deck
    card(6),
  ];
  const reviews = [
    review(1, 1, 30), // forgotten 30 h ago
    review(2, 1, 2), // forgotten 2 h ago
    review(2, 1, 1), // ...and again 1 h ago
    review(3, 1, 1), // suspended
    review(4, 1, 5),
    review(5, 1, 1), // outside the deck
    review(6, 3, 1), // answered Good, not forgotten
  ];
  const deckIds = new Set([1, 2]);

  it("selects cards answered Again within the window, most recent first", () => {
    expect(forgottenCards(cards, reviews, deckIds, 1, NOW).map((c) => c.id)).toEqual([2, 4]);
    expect(forgottenCards(cards, reviews, deckIds, 2, NOW).map((c) => c.id)).toEqual([2, 4, 1]);
  });

  it("returns nothing without lapses", () => {
    expect(forgottenCards(cards, [review(6, 3, 1)], deckIds, 7, NOW)).toEqual([]);
  });
});

describe("practice queue", () => {
  const cards = [card(1), card(2), card(3)];

  it("shows cards in order and removes them on Good / Easy", () => {
    let queue = createPracticeQueue(cards, NOW);
    expect(nextPractice(queue, NOW)?.id).toBe(1);
    queue = answerPractice(queue, 1, Rating.Good, NOW);
    queue = answerPractice(queue, 2, Rating.Easy, NOW);
    expect(queue.items.map((i) => i.card.id)).toEqual([3]);
  });

  it("brings back Again after a minute and Hard after ten minutes", () => {
    let queue = createPracticeQueue(cards, NOW);
    queue = answerPractice(queue, 1, Rating.Again, NOW);
    queue = answerPractice(queue, 2, Rating.Hard, NOW);
    expect(nextPractice(queue, NOW)?.id).toBe(3);

    const later = new Date(NOW.getTime() + PRACTICE_DELAY_MS[Rating.Again]!);
    queue = answerPractice(queue, 3, Rating.Good, NOW);
    expect(nextPractice(queue, later)?.id).toBe(1);
    expect(queue.items.find((i) => i.card.id === 2)?.dueAt).toBe(
      NOW.getTime() + PRACTICE_DELAY_MS[Rating.Hard]!,
    );
  });

  it("does not make the learner wait when only waiting cards are left", () => {
    let queue = createPracticeQueue([card(1), card(2)], NOW);
    queue = answerPractice(queue, 1, Rating.Hard, NOW);
    queue = answerPractice(queue, 2, Rating.Again, NOW);
    // Nothing is due yet: the earliest waiting card (Again) comes first.
    expect(nextPractice(queue, NOW)?.id).toBe(2);
  });

  it("is a value type, so snapshots work for undo", () => {
    const before = createPracticeQueue(cards, NOW);
    const after = answerPractice(before, 1, Rating.Good, NOW);
    expect(before.items).toHaveLength(3);
    expect(after.items).toHaveLength(2);
    expect(nextPractice(createPracticeQueue([], NOW), NOW)).toBeNull();
  });
});
