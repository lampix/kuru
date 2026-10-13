"use client";

import { useLiveQuery } from "dexie-react-hooks";

import { buildDeckTree } from "@/lib/study/deck-tree";
import { studyDay } from "@/lib/study/time";

import { META, db } from ".";

export interface DayConfig {
  timezone: string;
  rolloverHour: number;
}

const browserTimezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

/** Timezone and rollover hour as last received from the server. */
export function useDayConfig(): DayConfig | undefined {
  return useLiveQuery(async () => {
    const [timezone, rolloverHour] = await Promise.all([
      db.meta.get(META.timezone),
      db.meta.get(META.rolloverHour),
    ]);
    return {
      timezone: (timezone?.value as string | undefined) ?? browserTimezone(),
      rolloverHour: (rolloverHour?.value as number | undefined) ?? 4,
    };
  });
}

/** The deck tree with today's counts; `undefined` while loading. */
export function useDeckTree(now: Date | null) {
  const minute = now ? Math.floor(now.getTime() / 60000) : 0;
  return useLiveQuery(async () => {
    if (!now) return undefined;
    const [decks, cards, presets, reviews, tz, rollover] = await Promise.all([
      db.decks.toArray(),
      db.cards.toArray(),
      db.presets.toArray(),
      db.reviews.toArray(),
      db.meta.get(META.timezone),
      db.meta.get(META.rolloverHour),
    ]);
    const at = new Date(minute * 60000);
    const day = studyDay(
      at,
      (tz?.value as string) ?? browserTimezone(),
      (rollover?.value as number) ?? 4,
    );
    return buildDeckTree({ decks, cards, presets, reviews, now: at, day });
  }, [minute]);
}
