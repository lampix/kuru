"use client";

import { Check } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";

import { BarButton, ListRow, ListSection } from "@/components/ios";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { CARD_STATUSES, type CardStatus, type FacetCounts } from "@/lib/browse/filter";

import { StatusDot } from "./status-dot";

export interface FilterState {
  statuses: ReadonlySet<CardStatus>;
  deckId: number | null;
  cardTypes: ReadonlySet<string>;
}

export const EMPTY_FILTERS: FilterState = {
  statuses: new Set(),
  deckId: null,
  cardTypes: new Set(),
};

export const STATUS_LABEL = {
  new: "stateNew",
  learning: "stateLearning",
  review: "stateReview",
  suspended: "stateSuspended",
  buried: "stateBuried",
} as const satisfies Record<CardStatus, string>;

function toggle<T>(set: ReadonlySet<T>, value: T): Set<T> {
  const next = new Set(set);
  if (!next.delete(value)) next.add(value);
  return next;
}

const checkmark = <Check className="size-5 shrink-0 text-tint" strokeWidth={2.6} aria-hidden />;

/**
 * Bottom sheet with the browser's deck, card-type and status filters. Counts show how many cards
 * each option leaves, given the search and the other filters.
 */
export function FilterSheet({
  open,
  onOpenChange,
  value,
  onChange,
  decks,
  counts,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: FilterState;
  onChange: (value: FilterState) => void;
  decks: ReadonlyArray<{ id: number; name: string }>;
  counts: FacetCounts;
}) {
  const t = useTranslations("browse");
  const common = useTranslations("common");
  const format = useFormatter();
  const active = value.statuses.size > 0 || value.deckId !== null || value.cardTypes.size > 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        aria-describedby={undefined}
        className="max-h-[92dvh] gap-0 overflow-y-auto rounded-t-[14px] border-0 bg-grouped px-4 pb-[calc(env(safe-area-inset-bottom)+16px)]"
      >
        <div className="sticky top-0 z-10 -mx-4 flex h-12 items-center bg-grouped px-2">
          <div className="flex flex-1 basis-0">
            <BarButton disabled={!active} onClick={() => onChange(EMPTY_FILTERS)}>
              {t("resetFilters")}
            </BarButton>
          </div>
          <SheetTitle className="text-headline">{t("filters")}</SheetTitle>
          <div className="flex flex-1 basis-0 justify-end">
            <BarButton bold onClick={() => onOpenChange(false)}>
              {common("done")}
            </BarButton>
          </div>
        </div>

        <ListSection header={t("deck")}>
          <ListRow
            title={t("allDecks")}
            detail={format.number(counts.any.decks)}
            onClick={() => onChange({ ...value, deckId: null })}
            accessory={value.deckId === null ? checkmark : null}
          />
          {decks.map((deck) => {
            const parts = deck.name.split("::");
            return (
              <ListRow
                key={deck.id}
                title={
                  <span style={{ paddingLeft: `${(parts.length - 1) * 16}px` }} className="block">
                    {parts.at(-1)}
                  </span>
                }
                detail={format.number(counts.decks.get(deck.id) ?? 0)}
                onClick={() => onChange({ ...value, deckId: deck.id })}
                accessory={value.deckId === deck.id ? checkmark : null}
              />
            );
          })}
        </ListSection>

        {counts.cardTypes.length > 0 ? (
          <ListSection header={t("cardType")}>
            <ListRow
              title={t("allCardTypes")}
              detail={format.number(counts.any.cardTypes)}
              onClick={() => onChange({ ...value, cardTypes: new Set() })}
              accessory={value.cardTypes.size === 0 ? checkmark : null}
            />
            {counts.cardTypes.map((option) => (
              <ListRow
                key={option.name}
                title={option.name}
                subtitle={option.noteTypes.length > 1 ? option.noteTypes.join(", ") : undefined}
                detail={format.number(option.count)}
                onClick={() =>
                  onChange({ ...value, cardTypes: toggle(value.cardTypes, option.name) })
                }
                accessory={
                  value.cardTypes.has(option.name) ? checkmark : <span className="size-5" />
                }
              />
            ))}
          </ListSection>
        ) : null}
        <ListSection header={t("status")}>
          <ListRow
            title={t("allStatuses")}
            detail={format.number(counts.any.statuses)}
            onClick={() => onChange({ ...value, statuses: new Set() })}
            accessory={value.statuses.size === 0 ? checkmark : null}
          />
          {CARD_STATUSES.map((status) => (
            <ListRow
              key={status}
              icon={<StatusDot status={status} className="mx-[9.5px]" />}
              title={t(STATUS_LABEL[status])}
              detail={format.number(counts.statuses[status])}
              onClick={() => onChange({ ...value, statuses: toggle(value.statuses, status) })}
              accessory={value.statuses.has(status) ? checkmark : <span className="size-5" />}
            />
          ))}
        </ListSection>
      </SheetContent>
    </Sheet>
  );
}
