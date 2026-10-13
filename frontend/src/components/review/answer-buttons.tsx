"use client";

import { useLocale, useTranslations } from "next-intl";

import type { LocalCard } from "@/lib/db";
import { type Rating, RATINGS, type Scheduler, formatInterval } from "@/lib/fsrs";
import { cn } from "@/lib/utils";

const STYLE: Record<Rating, { key: "again" | "hard" | "good" | "easy"; className: string }> = {
  1: { key: "again", className: "bg-ios-red" },
  2: { key: "hard", className: "bg-ios-orange" },
  3: { key: "good", className: "bg-ios-blue" },
  4: { key: "easy", className: "bg-ios-green" },
};

/** The four answer buttons (red, orange, blue, green) with the resulting FSRS intervals. */
export function AnswerButtons({
  card,
  scheduler,
  onAnswer,
}: {
  card: LocalCard;
  scheduler: Scheduler;
  onAnswer: (rating: Rating) => void;
}) {
  const t = useTranslations("review");
  const locale = useLocale();
  const now = new Date();
  const preview = scheduler.preview(card, now);
  return (
    <div className="grid grid-cols-4 gap-2">
      {RATINGS.map((rating) => {
        const due = preview[rating].due;
        const seconds = due ? (new Date(due).getTime() - now.getTime()) / 1000 : 0;
        return (
          <button
            key={rating}
            type="button"
            onClick={() => onAnswer(rating)}
            className={cn(
              "flex h-[58px] flex-col items-center justify-center rounded-[14px] text-white transition-transform active:scale-95 active:opacity-80",
              STYLE[rating].className,
            )}
          >
            <span className="text-caption font-medium tabular-nums opacity-90">
              {formatInterval(seconds, locale)}
            </span>
            <span className="text-subhead font-semibold">{t(STYLE[rating].key)}</span>
          </button>
        );
      })}
    </div>
  );
}
