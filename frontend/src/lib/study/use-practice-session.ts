"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { db, type LocalCard } from "@/lib/db";
import { type Rating, Scheduler } from "@/lib/fsrs";

import {
  type PracticeQueue,
  answerPractice,
  createPracticeQueue,
  forgottenCards,
  nextPractice,
  removePractice,
} from "./practice";
import { subtreeIds } from "./queue";
import { type SessionData, type StudySession, loadSession } from "./use-study-session";

const UNDO_DEPTH = 50;
const NO_COUNTS = { new: 0, learning: 0, review: 0 };

export type PracticeKind = "forgotten";

/**
 * A practice session (custom study) over a deck and its sub-decks. It only lives in memory:
 * answers decide what is shown again, but nothing is recorded, queued or synced.
 */
export function usePracticeSession(
  deckId: number | null,
  kind: PracticeKind,
  days: number,
): StudySession {
  const [data, setData] = useState<SessionData | null | undefined>(undefined);
  const [queue, setQueue] = useState<PracticeQueue | null>(null);
  const [history, setHistory] = useState<PracticeQueue[]>([]);
  const [showing, setShowing] = useState(0);
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (deckId === null) return;
    void loadSession(deckId).then((loaded) => {
      if (cancelled) return;
      const at = new Date();
      setData(loaded);
      setNow(at);
      if (loaded && kind === "forgotten") {
        const ids = subtreeIds(loaded.decks, loaded.deck);
        const cards = forgottenCards([...loaded.cards.values()], loaded.reviews, ids, days, at);
        setQueue(createPracticeQueue(cards, at));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [deckId, kind, days]);

  const scheduler = useMemo(() => (data ? new Scheduler(data.preset) : null), [data]);
  const current = queue && now ? nextPractice(queue, now) : null;
  const next = useMemo(() => {
    if (!queue || !now || !current) return null;
    return nextPractice(removePractice(queue, current.id), now);
  }, [queue, now, current]);

  const answer = useCallback(
    async (rating: Rating) => {
      if (!queue || !current) return;
      const at = new Date();
      setHistory((h) => [...h.slice(-UNDO_DEPTH + 1), queue]);
      setQueue(answerPractice(queue, current.id, rating, at));
      setShowing((n) => n + 1);
      setNow(at);
    },
    [queue, current],
  );

  const undo = useCallback(async () => {
    const previous = history[history.length - 1];
    if (!previous) return;
    setHistory((h) => h.slice(0, -1));
    setQueue(previous);
    setShowing((n) => n + 1);
    setNow(new Date());
  }, [history]);

  // Bury / suspend are real actions: persist them and drop the card from the session.
  const dismissCurrent = useCallback(
    async (patch: Partial<LocalCard>) => {
      if (!queue || !current) return;
      await db.cards.put({ ...current, ...patch });
      setQueue(removePractice(queue, current.id));
      setShowing((n) => n + 1);
      setNow(new Date());
    },
    [queue, current],
  );

  const noteType = useCallback((card: LocalCard) => data?.noteTypes.get(card.note_type_id), [data]);
  const deckName = useCallback(
    (card: LocalCard) => data?.decks.find((d) => d.id === card.deck_id)?.name ?? "",
    [data],
  );

  return {
    mode: "practice",
    status: deckId === null || data === null ? "missing" : !queue ? "loading" : "ready",
    deck: data?.deck ?? null,
    preset: data?.preset ?? null,
    scheduler,
    current,
    next,
    noteType,
    deckName,
    counts: NO_COUNTS,
    remaining: queue?.items.length ?? 0,
    showing,
    nextLearningDue: null,
    canUndo: history.length > 0,
    answer,
    undo,
    dismissCurrent,
  };
}
