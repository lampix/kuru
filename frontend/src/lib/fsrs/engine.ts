/**
 * Client-side FSRS-6 scheduling with `ts-fsrs` (ADR 0004).
 *
 * Every answer is computed locally — online and offline — and queued for the server, which replays
 * the review with py-fsrs and returns the authoritative state.
 */

import {
  type Card as FsrsCard,
  type Grade,
  type StepUnit,
  fsrs,
  generatorParameters,
  Rating as FsrsRating,
} from "ts-fsrs";

import { fuzzInterval, fuzzSeed } from "./fuzz";
import { normalizeWeights } from "./weights";

export const CardState = { New: 0, Learning: 1, Review: 2, Relearning: 3 } as const;
export type CardState = (typeof CardState)[keyof typeof CardState];

export const Rating = { Again: 1, Hard: 2, Good: 3, Easy: 4 } as const;
export type Rating = (typeof Rating)[keyof typeof Rating];
export const RATINGS: readonly Rating[] = [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy];

/** Scheduling-relevant card state; field names match the API's `CardMemory`. */
export interface MemoryState {
  card_id: number;
  state: CardState;
  step: number | null;
  stability: number | null;
  difficulty: number | null;
  due: string | null;
  last_review: string | null;
  reps: number;
  lapses: number;
}

export interface SchedulingOptions {
  fsrs_weights?: readonly number[] | null;
  desired_retention: number;
  maximum_interval: number;
  learning_steps: readonly number[];
  relearning_steps: readonly number[];
  enable_fuzz: boolean;
}

const DAY_MS = 86_400_000;

const toSteps = (minutes: readonly number[]): StepUnit[] => minutes.map((m) => `${m}m` as StepUnit);

export class Scheduler {
  private readonly engine;

  constructor(private readonly options: SchedulingOptions) {
    this.engine = fsrs(
      generatorParameters({
        w: normalizeWeights(options.fsrs_weights),
        request_retention: options.desired_retention,
        maximum_interval: options.maximum_interval,
        learning_steps: toSteps(options.learning_steps),
        relearning_steps: toSteps(options.relearning_steps),
        enable_short_term: true,
        enable_fuzz: false, // replaced by deterministic fuzz shared with the server
      }),
    );
  }

  private toFsrs(memory: MemoryState, now: Date): FsrsCard {
    return {
      due: memory.due ? new Date(memory.due) : now,
      stability: memory.stability ?? 0,
      difficulty: memory.difficulty ?? 0,
      elapsed_days: 0,
      scheduled_days: 0,
      learning_steps: memory.step ?? 0,
      reps: memory.reps,
      lapses: memory.lapses,
      state: memory.state,
      last_review: memory.last_review ? new Date(memory.last_review) : undefined,
    };
  }

  /** State after answering `memory` with `rating` at `at`. */
  review(memory: MemoryState, rating: Rating, at: Date = new Date()): MemoryState {
    let now = at;
    if (memory.last_review && now < new Date(memory.last_review))
      now = new Date(memory.last_review);
    const { card } = this.engine.next(this.toFsrs(memory, now), now, rating as unknown as Grade);
    let due = card.due;
    if (this.options.enable_fuzz && card.state === CardState.Review) {
      const days = Math.floor((due.getTime() - now.getTime()) / DAY_MS);
      const fuzzed = fuzzInterval(
        days,
        fuzzSeed(memory.card_id, memory.reps),
        this.options.maximum_interval,
      );
      due = new Date(now.getTime() + fuzzed * DAY_MS);
    }
    const lapsed = memory.state === CardState.Review && rating === Rating.Again;
    return {
      card_id: memory.card_id,
      state: card.state as CardState,
      step: card.state === CardState.Review ? null : card.learning_steps,
      stability: card.stability,
      difficulty: card.difficulty,
      due: due.toISOString(),
      last_review: now.toISOString(),
      reps: memory.reps + 1,
      lapses: memory.lapses + (lapsed ? 1 : 0),
    };
  }

  /** Outcome for each of the four ratings. */
  preview(memory: MemoryState, now: Date = new Date()): Record<Rating, MemoryState> {
    return {
      [Rating.Again]: this.review(memory, Rating.Again, now),
      [Rating.Hard]: this.review(memory, Rating.Hard, now),
      [Rating.Good]: this.review(memory, Rating.Good, now),
      [Rating.Easy]: this.review(memory, Rating.Easy, now),
    };
  }

  /** Probability of recall at `now`, or null for unreviewed cards. */
  retrievability(memory: MemoryState, now: Date = new Date()): number | null {
    if (memory.state === CardState.New || memory.stability == null) return null;
    const value = this.engine.get_retrievability(this.toFsrs(memory, now), now, false);
    return typeof value === "number" ? value : null;
  }
}

export { FsrsRating };
