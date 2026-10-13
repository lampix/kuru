"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { NetworkError, api } from "@/lib/api/client";
import type { NoteType, Preset, SyncDeck } from "@/lib/api/types";
import { META, db, type LocalCard, type LocalReview } from "@/lib/db";
import { CardState, type Rating, Scheduler } from "@/lib/fsrs";
import { applyMemory } from "@/lib/sync/outbox";
import { scheduleFlush } from "@/lib/sync/manager";

import { type AnswerRecord, recordAnswer, undoLocal } from "./answer";
import { presetForDeck } from "./deck-tree";
import {
  type QueueCounts,
  buildQueue,
  pickNext,
  queueCounts,
  studiedToday,
  subtreeIds,
} from "./queue";
import { type StudyDay, studyDay } from "./time";

interface SessionData {
  deck: SyncDeck;
  decks: SyncDeck[];
  preset: Preset;
  noteTypes: Map<number, NoteType>;
  cards: Map<number, LocalCard>;
  reviews: LocalReview[];
  timezone: string;
  rolloverHour: number;
}

export interface StudySession {
  status: "loading" | "missing" | "ready";
  deck: SyncDeck | null;
  preset: Preset | null;
  scheduler: Scheduler | null;
  current: LocalCard | null;
  next: LocalCard | null;
  noteType: (card: LocalCard) => NoteType | undefined;
  deckName: (card: LocalCard) => string;
  counts: QueueCounts;
  nextLearningDue: Date | null;
  canUndo: boolean;
  answer: (rating: Rating, durationMs: number) => Promise<void>;
  undo: () => Promise<void>;
  /** Remove the current card from the session after suspending/burying it. */
  dismissCurrent: (patch: Partial<LocalCard>) => Promise<void>;
}

const UNDO_DEPTH = 20;

async function loadSession(deckId: number): Promise<SessionData | null> {
  const [decks, presets, noteTypes, reviews, tz, rollover] = await Promise.all([
    db.decks.toArray(),
    db.presets.toArray(),
    db.noteTypes.toArray(),
    db.reviews.toArray(),
    db.meta.get(META.timezone),
    db.meta.get(META.rolloverHour),
  ]);
  const deck = decks.find((d) => d.id === deckId);
  const preset = deck ? presetForDeck(deck, presets) : undefined;
  if (!deck || !preset) return null;
  const ids = [...subtreeIds(decks, deck)];
  const cards = await db.cards.where("deck_id").anyOf(ids).toArray();
  return {
    deck,
    decks,
    preset,
    noteTypes: new Map(noteTypes.map((nt) => [nt.id, nt])),
    cards: new Map(cards.map((c) => [c.id, c])),
    reviews,
    timezone: (tz?.value as string) ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
    rolloverHour: (rollover?.value as number) ?? 4,
  };
}

/** A review session over a deck and its sub-decks. */
export function useStudySession(deckId: number | null): StudySession {
  const [data, setData] = useState<SessionData | null | undefined>(undefined);
  const [now, setNow] = useState<Date | null>(null);
  const [history, setHistory] = useState<AnswerRecord[]>([]);
  const [reviewsSinceNew, setReviewsSinceNew] = useState(0);

  useEffect(() => {
    let cancelled = false;
    if (deckId === null) return;
    void loadSession(deckId).then((loaded) => {
      if (cancelled) return;
      setData(loaded);
      setNow(new Date());
    });
    return () => {
      cancelled = true;
    };
  }, [deckId]);

  const scheduler = useMemo(() => (data ? new Scheduler(data.preset) : null), [data]);

  const derived = useMemo(() => {
    if (!data || !now) return null;
    const day: StudyDay = studyDay(now, data.timezone, data.rolloverHour);
    const ids = subtreeIds(data.decks, data.deck);
    const studied = studiedToday(data.reviews, data.cards, ids, day);
    const queue = buildQueue({
      cards: [...data.cards.values()],
      preset: data.preset,
      studied,
      now,
      day,
    });
    const pick = pickNext(queue, now, reviewsSinceNew);
    // Peek at what follows for audio pre-buffering.
    const rest = {
      learning: queue.learning.filter((c) => c.id !== pick.card?.id),
      review: queue.review.filter((c) => c.id !== pick.card?.id),
      new: queue.new.filter((c) => c.id !== pick.card?.id),
    };
    const following = pickNext(rest, now, reviewsSinceNew + 1).card;
    return { counts: queueCounts(queue), pick, following };
  }, [data, now, reviewsSinceNew]);

  // When only learning cards due later remain, wake up when the next one is due.
  const nextDue = derived?.pick.card === null ? derived.pick.nextLearningDue : null;
  useEffect(() => {
    if (!nextDue) return;
    const timer = setTimeout(
      () => setNow(new Date()),
      Math.max(1000, nextDue.getTime() - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [nextDue]);

  const replaceCard = useCallback(
    (card: LocalCard, review?: LocalReview, removeReview?: string) => {
      setData((current) => {
        if (!current) return current;
        const cards = new Map(current.cards);
        cards.set(card.id, card);
        let reviews = current.reviews;
        if (review) reviews = [...reviews, review];
        if (removeReview) reviews = reviews.filter((r) => r.id !== removeReview);
        return { ...current, cards, reviews };
      });
      setNow(new Date());
    },
    [],
  );

  const answer = useCallback(
    async (rating: Rating, durationMs: number) => {
      const card = derived?.pick.card;
      if (!card || !scheduler) return;
      const record = await recordAnswer(db, scheduler, card, rating, durationMs);
      setReviewsSinceNew((n) => (card.state === CardState.New ? 0 : n + 1));
      const review = await db.reviews.get(record.reviewId);
      replaceCard(record.after, review);
      setHistory((h) => [...h.slice(-UNDO_DEPTH + 1), record]);
      scheduleFlush();
    },
    [derived, scheduler, replaceCard],
  );

  const undo = useCallback(async () => {
    const record = history[history.length - 1];
    if (!record) return;
    let restored: LocalCard = record.before;
    if (!(await undoLocal(db, record))) {
      // Already uploaded: undo on the server, which returns the restored state.
      try {
        const memory = await api.undoReview(record.reviewId);
        restored = applyMemory(record.before, memory);
        await db.transaction("rw", db.cards, db.reviews, async () => {
          await db.cards.put(restored);
          await db.reviews.delete(record.reviewId);
        });
      } catch (error) {
        if (error instanceof NetworkError) return; // cannot undo offline once synced
        throw error;
      }
    }
    setHistory((h) => h.slice(0, -1));
    replaceCard(restored, undefined, record.reviewId);
  }, [history, replaceCard]);

  const dismissCurrent = useCallback(
    async (patch: Partial<LocalCard>) => {
      const card = derived?.pick.card;
      if (!card) return;
      const updated = { ...card, ...patch };
      await db.cards.put(updated);
      replaceCard(updated);
    },
    [derived, replaceCard],
  );

  const noteType = useCallback((card: LocalCard) => data?.noteTypes.get(card.note_type_id), [data]);
  const deckName = useCallback(
    (card: LocalCard) => data?.decks.find((d) => d.id === card.deck_id)?.name ?? "",
    [data],
  );

  return {
    status:
      deckId === null || data === null
        ? "missing"
        : data === undefined || !derived
          ? "loading"
          : "ready",
    deck: data?.deck ?? null,
    preset: data?.preset ?? null,
    scheduler,
    current: derived?.pick.card ?? null,
    next: derived?.following ?? null,
    noteType,
    deckName,
    counts: derived?.counts ?? { new: 0, learning: 0, review: 0 },
    nextLearningDue: derived?.pick.nextLearningDue ?? null,
    canUndo: history.length > 0,
    answer,
    undo,
    dismissCurrent,
  };
}
