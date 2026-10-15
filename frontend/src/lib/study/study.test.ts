import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Preset } from "@/lib/api/types";
import { KuruDatabase, type LocalCard, type LocalReview } from "@/lib/db";
import { CardState, Rating, Scheduler } from "@/lib/fsrs";
import { flushOutbox } from "@/lib/sync/outbox";

import { recordAnswer, undoLocal } from "./answer";
import { buildDeckTree } from "./deck-tree";
import { buildQueue, pickNext, studiedToday } from "./queue";
import { studyDay, zonedTimeToUtc } from "./time";

const preset: Preset = {
  id: 1,
  name: "Default",
  desired_retention: 0.9,
  maximum_interval: 36500,
  fsrs_weights: [],
  weights_are_default: true,
  learning_steps: [1, 10],
  relearning_steps: [10],
  enable_fuzz: true,
  new_per_day: 2,
  reviews_per_day: 2,
  new_card_order: "sequential",
  bury_new: false,
  bury_reviews: false,
  bury_interday_learning: false,
  autoplay_audio: true,
  show_answer_timer: 0,
  deck_count: 1,
  is_default: true,
  updated_at: "2026-01-01T00:00:00Z",
};

let nextId = 1;
const card = (patch: Partial<LocalCard> = {}): LocalCard => {
  const id = nextId++;
  return {
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
    state: CardState.New,
    step: null,
    stability: null,
    difficulty: null,
    due: null,
    last_review: null,
    reps: 0,
    lapses: 0,
    suspended: false,
    buried_until: null,
    ...patch,
  };
};

const NOW = new Date("2026-06-01T10:00:00Z");
const DAY = studyDay(NOW, "Europe/Vienna", 4);
const empty = { newCards: new Set<number>(), reviews: 0, notes: new Set<number>() };

describe("study day", () => {
  it("starts at the rollover hour in the user's timezone", () => {
    expect(DAY.start.toISOString()).toBe("2026-06-01T02:00:00.000Z"); // 04:00 CEST
    expect(DAY.end.toISOString()).toBe("2026-06-02T02:00:00.000Z");
    const early = studyDay(new Date("2026-06-01T01:00:00Z"), "Europe/Vienna", 4); // 03:00 local
    expect(early.key).toBe(20260531);
  });

  it("handles DST transitions", () => {
    expect(zonedTimeToUtc(2026, 3, 29, 4, "Europe/Vienna").toISOString()).toBe(
      "2026-03-29T02:00:00.000Z",
    );
  });
});

describe("queue", () => {
  it("applies limits, skips suspended/buried and future cards", () => {
    const due = (h: number) => new Date(NOW.getTime() + h * 3_600_000).toISOString();
    const cards = [
      card(),
      card(),
      card(),
      card({ state: CardState.Review, due: due(-5), stability: 5, difficulty: 5 }),
      card({ state: CardState.Review, due: due(-4), stability: 5, difficulty: 5 }),
      card({ state: CardState.Review, due: due(-3), stability: 5, difficulty: 5 }),
      card({ state: CardState.Review, due: due(-3), suspended: true }),
      card({ state: CardState.Review, due: due(-3), buried_until: due(10) }),
      card({ state: CardState.Review, due: due(48) }),
      card({ state: CardState.Learning, due: due(0.1), step: 1 }),
    ];
    const queue = buildQueue({ cards, preset, studied: empty, now: NOW, day: DAY });
    expect(queue.new).toHaveLength(2);
    expect(queue.review.map((c) => c.id)).toEqual([cards[3]!.id, cards[4]!.id]);
    expect(queue.learning).toHaveLength(1);

    // Learning cards due later are shown only within the learn-ahead window.
    const pick = pickNext({ ...queue, review: [], new: [] }, NOW, 0);
    expect(pick.card?.id).toBe(cards[9]!.id);
  });

  it("counts what was studied today and buries siblings", () => {
    const a = card();
    const sibling = card({ note_id: a.note_id });
    const reviews: LocalReview[] = [
      {
        id: "r",
        card_id: a.id,
        rating: 3,
        reviewed_at: NOW.toISOString(),
        kind: 0,
        was_new: true,
        duration_ms: 1,
      },
    ];
    const studied = studiedToday(reviews, new Map([[a.id, a]]), new Set([1]), DAY);
    expect(studied.newCards.size).toBe(1);
    const queue = buildQueue({
      cards: [sibling],
      preset: { ...preset, bury_new: true },
      studied,
      now: NOW,
      day: DAY,
    });
    expect(queue.new).toEqual([]);
  });

  it("mixes new cards between reviews", () => {
    const reviews = [1, 2, 3, 4].map(() =>
      card({ state: CardState.Review, due: NOW.toISOString() }),
    );
    const fresh = [card(), card()];
    const queue = { learning: [], review: reviews, new: fresh };
    expect(pickNext(queue, NOW, 0).card?.state).toBe(CardState.Review);
    expect(pickNext(queue, NOW, 2).card?.state).toBe(CardState.New);
  });

  it("builds a deck tree with aggregated counts", () => {
    const decks = [
      { id: 1, name: "Lang", description: "", config_id: 1, updated_at: "" },
      { id: 2, name: "Lang::JP", description: "", config_id: 1, updated_at: "" },
    ];
    const cards = [card({ deck_id: 2 }), card({ deck_id: 2 }), card({ deck_id: 2 })];
    const [root] = buildDeckTree({
      decks,
      cards,
      presets: [preset],
      reviews: [],
      now: NOW,
      day: DAY,
    });
    expect(root?.children[0]?.shortName).toBe("JP");
    expect(root?.counts.new).toBe(2); // limited by new_per_day
    expect(root?.total).toBe(3);
  });
});

describe("answers and outbox", () => {
  let db: KuruDatabase;
  beforeEach(async () => {
    db = new KuruDatabase(`test-${Math.random()}`);
    await db.open();
  });

  it("records, undoes and uploads answers", async () => {
    const scheduler = new Scheduler(preset);
    const original = card();
    await db.cards.put(original);

    const first = await recordAnswer(db, scheduler, original, Rating.Good, 1200, NOW);
    expect(first.after.state).toBe(CardState.Learning);
    expect(await db.outbox.count()).toBe(1);
    expect((await db.reviews.get(first.reviewId))?.was_new).toBe(true);

    expect(await undoLocal(db, first)).toBe(true);
    expect((await db.cards.get(original.id))?.state).toBe(CardState.New);
    expect(await db.outbox.count()).toBe(0);

    const second = await recordAnswer(db, scheduler, original, Rating.Easy, 900, NOW);
    const serverState = { ...second.after, card_id: original.id, stability: 99 };
    const fetchMock = vi.fn(async () =>
      Response.json({
        accepted: [second.reviewId],
        duplicates: [],
        rejected: {},
        cards: [serverState],
        server_time: NOW.toISOString(),
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const result = await flushOutbox(db);
    vi.unstubAllGlobals();
    expect(result.sent).toBe(1);
    expect(await db.outbox.count()).toBe(0);
    expect((await db.cards.get(original.id))?.stability).toBe(99); // server state wins
    expect(await undoLocal(db, second)).toBe(false); // already synced
  });
});

describe("review sync window", () => {
  const now = new Date("2026-10-15T12:00:00Z");
  const dayStart = new Date("2026-10-15T02:00:00Z");
  const days = (d: Date) => Math.round((now.getTime() - d.getTime()) / 86_400_000);

  it("fetches 30 days on the first sync", async () => {
    const { reviewWindow } = await import("@/lib/sync/engine");
    const w = reviewWindow(now, dayStart, null);
    expect(days(w.since)).toBe(30);
    expect(days(w.keepFrom)).toBe(30);
  });

  it("covers the gap since the last sync, at least the previous study day", async () => {
    const { reviewWindow } = await import("@/lib/sync/engine");
    expect(days(reviewWindow(now, dayStart, "2026-10-10T12:00:00Z").since)).toBe(6);
    expect(reviewWindow(now, dayStart, "2026-10-15T11:00:00Z").since.toISOString()).toBe(
      "2026-10-14T02:00:00.000Z",
    );
    expect(days(reviewWindow(now, dayStart, "2026-01-01T00:00:00Z").since)).toBe(30);
  });
});
