import { describe, expect, it } from "vitest";

import vectors from "../../../../shared/test-vectors/fsrs.json";
import {
  CardState,
  DEFAULT_WEIGHTS,
  type MemoryState,
  Rating,
  Scheduler,
  fnv1a,
  formatInterval,
  fuzzInterval,
  mulberry32,
  normalizeWeights,
} from ".";

const OPTIONS = {
  desired_retention: 0.9,
  maximum_interval: 36500,
  learning_steps: [1, 10],
  relearning_steps: [10],
  enable_fuzz: false,
};

const newCard = (cardId = 1): MemoryState => ({
  card_id: cardId,
  state: CardState.New,
  step: null,
  stability: null,
  difficulty: null,
  due: null,
  last_review: null,
  reps: 0,
  lapses: 0,
});

describe("deterministic fuzz (parity with Python)", () => {
  it("hashes identically", () => {
    for (const [text, expected] of Object.entries(vectors.fnv1a)) {
      expect(fnv1a(text)).toBe(expected);
    }
  });

  it("produces identical random numbers and fuzzed intervals", () => {
    for (const v of vectors.fuzz) {
      expect(mulberry32(v.seed)).toBe(v.random);
      expect(fuzzInterval(v.interval, v.seed, v.maximum_interval)).toBe(v.fuzzed);
    }
  });
});

describe("weights", () => {
  it("uses the same FSRS-6 defaults as py-fsrs", () => {
    expect(DEFAULT_WEIGHTS).toHaveLength(21);
    DEFAULT_WEIGHTS.forEach((w, i) => expect(w).toBeCloseTo(vectors.weights[i]!, 4));
  });

  it("extends FSRS-5 vectors", () => {
    const result = normalizeWeights(DEFAULT_WEIGHTS.slice(0, 19));
    expect(result.slice(19)).toEqual([0, 0.5]);
  });
});

describe("Scheduler", () => {
  it("matches py-fsrs review sequences", () => {
    const scheduler = new Scheduler(OPTIONS);
    for (const sequence of vectors.sequences) {
      let memory = newCard();
      for (const step of sequence) {
        memory = scheduler.review(memory, step.rating as Rating, new Date(step.reviewed_at));
        expect(memory.state).toBe(step.state);
        expect(memory.stability!).toBeCloseTo(step.stability, 2);
        expect(memory.difficulty!).toBeCloseTo(step.difficulty, 2);
        const drift = Math.abs(new Date(memory.due!).getTime() - new Date(step.due).getTime());
        expect(drift).toBeLessThanOrEqual(86_400_000); // rounding may differ by a day
        memory = { ...memory, due: step.due };
      }
    }
  });

  it("previews increasing intervals", () => {
    const scheduler = new Scheduler(OPTIONS);
    const now = new Date("2026-01-01T12:00:00Z");
    const reviewed = scheduler.review(newCard(), Rating.Easy, now);
    const preview = scheduler.preview(reviewed, new Date(reviewed.due!));
    const dues = [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy].map((r) =>
      new Date(preview[r].due!).getTime(),
    );
    expect([...dues].sort((a, b) => a - b)).toEqual(dues);
  });

  it("counts lapses and reports retrievability", () => {
    const scheduler = new Scheduler({ ...OPTIONS, enable_fuzz: true });
    const now = new Date("2026-01-01T12:00:00Z");
    const graduated = scheduler.review(newCard(), Rating.Easy, now);
    expect(graduated.state).toBe(CardState.Review);
    const lapsed = scheduler.review(graduated, Rating.Again, new Date(graduated.due!));
    expect(lapsed.lapses).toBe(1);
    expect(scheduler.retrievability(newCard())).toBeNull();
    expect(scheduler.retrievability(graduated, new Date(graduated.due!))).toBeGreaterThan(0.8);
  });
});

describe("formatInterval", () => {
  it.each([
    [30, "<1m"],
    [600, "10m"],
    [5400, "1.5h"],
    [2 * 86400, "2d"],
    [252 * 86400, "8.4mo"],
    [657 * 86400, "1.8y"],
  ])("%i seconds → %s", (seconds, label) => {
    expect(formatInterval(seconds)).toBe(label);
  });
});
