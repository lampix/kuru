"use client";

import { History, Minus, Plus } from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { ListRow, ListSection, RowIcon, iosButton } from "@/components/ios";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Link } from "@/i18n/navigation";
import type { SyncDeck } from "@/lib/api/types";
import { db } from "@/lib/db";
import { forgottenCards } from "@/lib/study/practice";
import { subtreeIds } from "@/lib/study/queue";
import { cn } from "@/lib/utils";

const MIN_DAYS = 1;
/** Reviews of the last 30 days are kept on the device (see lib/sync/engine.ts). */
const MAX_DAYS = 30;

/** "Custom Study" section of the deck overview — always available, even when nothing is due. */
export function CustomStudy({ deck }: { deck: SyncDeck }) {
  const t = useTranslations("decks");
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState(1);

  const count = useLiveQuery(async () => {
    if (!open) return undefined;
    const decks = await db.decks.toArray();
    const ids = subtreeIds(decks, deck);
    const [cards, reviews] = await Promise.all([
      db.cards
        .where("deck_id")
        .anyOf([...ids])
        .toArray(),
      db.reviews.toArray(),
    ]);
    return forgottenCards(cards, reviews, ids, days, new Date()).length;
  }, [open, days, deck]);

  const stepper =
    "flex size-9 items-center justify-center rounded-full bg-fill-3 text-tint active:opacity-50 disabled:opacity-30";

  return (
    <>
      <ListSection header={t("customStudy")} footer={t("customStudyFooter")}>
        <ListRow
          icon={<RowIcon icon={History} color="var(--ios-indigo)" />}
          title={t("forgotten")}
          onClick={() => setOpen(true)}
          chevron
        />
      </ListSection>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          className="gap-0 rounded-t-[14px] border-0 bg-grouped px-4 pb-[calc(env(safe-area-inset-bottom)+16px)]"
        >
          <SheetTitle className="pt-4 text-center text-headline">{t("forgotten")}</SheetTitle>
          <div className="mt-4 flex items-center gap-3 rounded-[10px] bg-grouped-2 px-4 py-3">
            <span className="flex-1 leading-snug">{t("forgottenWithin", { count: days })}</span>
            <button
              type="button"
              aria-label={t("fewerDays")}
              disabled={days <= MIN_DAYS}
              onClick={() => setDays((d) => Math.max(MIN_DAYS, d - 1))}
              className={stepper}
            >
              <Minus className="size-4" strokeWidth={2.6} />
            </button>
            <span className="w-6 text-center font-semibold tabular-nums">{days}</span>
            <button
              type="button"
              aria-label={t("moreDays")}
              disabled={days >= MAX_DAYS}
              onClick={() => setDays((d) => Math.min(MAX_DAYS, d + 1))}
              className={stepper}
            >
              <Plus className="size-4" strokeWidth={2.6} />
            </button>
          </div>
          <p className="px-4 pt-2 pb-4 text-footnote text-label-2" aria-live="polite">
            {count === undefined ? "…" : t("cards", { count })}
          </p>
          <Link
            href={{
              pathname: "/study",
              query: { deck: deck.id, custom: "forgotten", days },
            }}
            aria-disabled={!count}
            // Close the sheet: with cacheComponents the overview keeps its state while hidden,
            // so returning from the session would otherwise show the sheet again.
            onClick={() => setOpen(false)}
            className={cn(
              iosButton({ variant: "filled", size: "lg" }),
              "h-[54px]",
              !count && "pointer-events-none opacity-40",
            )}
          >
            {t("startPractice")}
          </Link>
        </SheetContent>
      </Sheet>
    </>
  );
}
