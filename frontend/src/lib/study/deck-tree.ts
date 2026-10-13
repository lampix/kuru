/** Deck hierarchy with today's limited due counts, computed locally. */

import type { Preset, SyncDeck } from "@/lib/api/types";
import type { LocalCard, LocalReview } from "@/lib/db";
import { CardState } from "@/lib/fsrs";

import { type QueueCounts, isAvailable, studiedToday, subtreeIds } from "./queue";
import type { StudyDay } from "./time";

export interface DeckNode {
  deck: SyncDeck;
  shortName: string;
  counts: QueueCounts;
  total: number;
  children: DeckNode[];
}

export function presetForDeck(deck: SyncDeck, presets: readonly Preset[]): Preset | undefined {
  return (
    presets.find((p) => p.id === deck.config_id) ?? presets.find((p) => p.is_default) ?? presets[0]
  );
}

export function buildDeckTree(input: {
  decks: readonly SyncDeck[];
  cards: readonly LocalCard[];
  presets: readonly Preset[];
  reviews: readonly LocalReview[];
  now: Date;
  day: StudyDay;
}): DeckNode[] {
  const { decks, cards, presets, reviews, now, day } = input;
  const cardsById = new Map(cards.map((c) => [c.id, c]));
  const raw = new Map<number, QueueCounts & { total: number }>();
  for (const card of cards) {
    const counts = raw.get(card.deck_id) ?? { new: 0, learning: 0, review: 0, total: 0 };
    counts.total += 1;
    if (isAvailable(card, now, day)) {
      if (card.state === CardState.New) counts.new += 1;
      else if (card.state === CardState.Review) counts.review += 1;
      else counts.learning += 1;
    }
    raw.set(card.deck_id, counts);
  }

  const sorted = [...decks].sort((a, b) => a.name.localeCompare(b.name));
  const nodes = new Map<string, DeckNode>();
  const roots: DeckNode[] = [];
  for (const deck of sorted) {
    const ids = subtreeIds(sorted, deck);
    const preset = presetForDeck(deck, presets);
    const done = studiedToday(reviews, cardsById, ids, day);
    const sum = { new: 0, learning: 0, review: 0, total: 0 };
    for (const id of ids) {
      const c = raw.get(id);
      if (!c) continue;
      sum.new += c.new;
      sum.learning += c.learning;
      sum.review += c.review;
      sum.total += c.total;
    }
    const node: DeckNode = {
      deck,
      shortName: deck.name.split("::").pop() ?? deck.name,
      counts: {
        new: Math.min(sum.new, Math.max(0, (preset?.new_per_day ?? 20) - done.newCards.size)),
        learning: sum.learning,
        review: Math.min(sum.review, Math.max(0, (preset?.reviews_per_day ?? 200) - done.reviews)),
      },
      total: sum.total,
      children: [],
    };
    nodes.set(deck.name, node);
    const parent = deck.name.includes("::") ? deck.name.slice(0, deck.name.lastIndexOf("::")) : "";
    const parentNode = parent ? nodes.get(parent) : undefined;
    if (parentNode) parentNode.children.push(node);
    else roots.push(node);
  }
  return roots;
}
