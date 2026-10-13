/**
 * Offline study queue — mirrors `backend/src/kuru/services/queue.py`.
 *
 * Works on in-memory arrays so a review session can rebuild its queue after every answer.
 */

import type { Preset, SyncDeck } from "@/lib/api/types";
import type { LocalCard, LocalReview } from "@/lib/db";
import { CardState, mulberry32 } from "@/lib/fsrs";

import type { StudyDay } from "./time";

/** Learning cards due within this window are shown early when nothing else is left (Anki). */
export const LEARN_AHEAD_MS = 20 * 60 * 1000;

export interface StudiedToday {
  newCards: Set<number>;
  reviews: number;
  notes: Set<number>;
}

export interface StudyQueue {
  learning: LocalCard[];
  review: LocalCard[];
  new: LocalCard[];
}

export interface QueueCounts {
  new: number;
  learning: number;
  review: number;
}

const REVIEW_KIND = 1;

export function subtreeIds(decks: readonly SyncDeck[], root: SyncDeck): Set<number> {
  const prefix = `${root.name}::`;
  return new Set(
    decks.filter((d) => d.id === root.id || d.name.startsWith(prefix)).map((d) => d.id),
  );
}

export function studiedToday(
  reviews: readonly LocalReview[],
  cardsById: ReadonlyMap<number, LocalCard>,
  deckIds: ReadonlySet<number>,
  day: StudyDay,
): StudiedToday {
  const result: StudiedToday = { newCards: new Set(), reviews: 0, notes: new Set() };
  const start = day.start.getTime();
  for (const review of reviews) {
    if (review.rating <= 0 || new Date(review.reviewed_at).getTime() < start) continue;
    const card = cardsById.get(review.card_id);
    if (!card || !deckIds.has(card.deck_id)) continue;
    result.notes.add(card.note_id);
    if (review.was_new) result.newCards.add(review.card_id);
    else if (review.kind === REVIEW_KIND) result.reviews += 1;
  }
  return result;
}

const dueTime = (card: LocalCard) => (card.due ? new Date(card.due).getTime() : 0);

export function isAvailable(card: LocalCard, now: Date, day: StudyDay): boolean {
  if (card.suspended) return false;
  if (card.buried_until && new Date(card.buried_until) > now) return false;
  return card.state === CardState.New || dueTime(card) < day.end.getTime();
}

function shuffled<T>(items: T[], seed: number): T[] {
  const out = [...items];
  let state = seed >>> 0;
  for (let i = out.length - 1; i > 0; i--) {
    state = (state + 0x9e3779b9) >>> 0;
    const j = Math.floor(mulberry32(state) * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

export function buildQueue(input: {
  cards: readonly LocalCard[];
  preset: Preset;
  studied: StudiedToday;
  now: Date;
  day: StudyDay;
}): StudyQueue {
  const { preset, studied, now, day } = input;
  const available = input.cards.filter((card) => isAvailable(card, now, day));
  const byDue = (a: LocalCard, b: LocalCard) => dueTime(a) - dueTime(b) || a.id - b.id;

  const learning = available
    .filter((c) => c.state === CardState.Learning || c.state === CardState.Relearning)
    .sort(byDue);

  const reviewLimit = Math.max(0, preset.reviews_per_day - studied.reviews);
  const seenNotes = new Set(preset.bury_reviews ? studied.notes : []);
  const review: LocalCard[] = [];
  for (const card of available.filter((c) => c.state === CardState.Review).sort(byDue)) {
    if (review.length >= reviewLimit) break;
    if (preset.bury_reviews) {
      if (seenNotes.has(card.note_id)) continue;
      seenNotes.add(card.note_id);
    }
    review.push(card);
  }

  const newLimit = Math.max(0, preset.new_per_day - studied.newCards.size);
  let candidates = available
    .filter((c) => c.state === CardState.New)
    .sort((a, b) => a.position - b.position || a.id - b.id);
  if (preset.new_card_order === "random")
    candidates = shuffled(candidates, day.key * 1_000_003 + preset.id);
  const seenNew = new Set(
    preset.bury_new ? [...studied.notes, ...review.map((c) => c.note_id)] : [],
  );
  const fresh: LocalCard[] = [];
  for (const card of candidates) {
    if (fresh.length >= newLimit) break;
    if (preset.bury_new) {
      if (seenNew.has(card.note_id)) continue;
      seenNew.add(card.note_id);
    }
    fresh.push(card);
  }

  return { learning, review, new: fresh };
}

export function queueCounts(queue: StudyQueue): QueueCounts {
  return { new: queue.new.length, learning: queue.learning.length, review: queue.review.length };
}

/**
 * Choose the next card: due learning cards first, then reviews with new cards mixed in evenly,
 * then learning cards within the learn-ahead window.
 */
export function pickNext(
  queue: StudyQueue,
  now: Date,
  reviewsSinceNew: number,
): { card: LocalCard | null; nextLearningDue: Date | null } {
  const nowMs = now.getTime();
  const dueLearning = queue.learning.find((c) => dueTime(c) <= nowMs);
  if (dueLearning) return { card: dueLearning, nextLearningDue: null };

  const { review, new: fresh } = queue;
  if (review.length || fresh.length) {
    const spacing = fresh.length ? Math.max(1, Math.floor(review.length / fresh.length)) : Infinity;
    const takeNew = fresh.length > 0 && (review.length === 0 || reviewsSinceNew >= spacing);
    return { card: takeNew ? fresh[0]! : review[0]!, nextLearningDue: null };
  }

  const ahead = queue.learning.find((c) => dueTime(c) <= nowMs + LEARN_AHEAD_MS);
  if (ahead) return { card: ahead, nextLearningDue: null };
  const later = queue.learning[0];
  return { card: null, nextLearningDue: later?.due ? new Date(later.due) : null };
}
