"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { ListFilter, Search, X } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { type ReactNode, useDeferredValue, useMemo, useState } from "react";

import { ListRow, NavigationPage } from "@/components/ios";
import { useNow } from "@/hooks/use-now";
import {
  type BrowseEntry,
  CARD_STATUSES,
  type CardStatus,
  cardTypeOptions,
  deckSubtree,
  filterCards,
  parseQuery,
  statusOf,
  templateBase,
  templateName,
} from "@/lib/browse/filter";
import { db, type LocalCard } from "@/lib/db";
import { CardState } from "@/lib/fsrs";
import { clozeToPlain } from "@/lib/render/cloze";
import { stripHtml } from "@/lib/render/html";
import { cn } from "@/lib/utils";

import { CardDetailSheet } from "./card-detail-sheet";
import { EMPTY_FILTERS, FilterSheet, type FilterState, STATUS_LABEL } from "./filter-sheet";
import { StatusDot } from "./status-dot";

const PAGE = 100;

function Chip({
  children,
  label,
  onRemove,
}: {
  children: ReactNode;
  label: string;
  onRemove: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onRemove}
      aria-label={label}
      className="flex h-7 max-w-[70vw] shrink-0 items-center gap-1.5 rounded-full bg-fill-3 pr-2 pl-2.5 text-subhead active:opacity-60"
    >
      <span className="flex min-w-0 items-center gap-1.5 truncate">{children}</span>
      <X className="size-3.5 shrink-0 text-label-2" strokeWidth={2.6} aria-hidden />
    </button>
  );
}

/** Searchable list of all cards — works offline on IndexedDB. */
export function BrowseScreen() {
  const t = useTranslations("browse");
  const format = useFormatter();
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [filterSheet, setFilterSheet] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const [selected, setSelected] = useState<number | null>(null);
  const deferredQuery = useDeferredValue(query);
  const now = useNow(60_000);

  const data = useLiveQuery(async () => {
    const [cards, decks, noteTypes] = await Promise.all([
      db.cards.toArray(),
      db.decks.orderBy("name").toArray(),
      db.noteTypes.toArray(),
    ]);
    const deckNames = new Map(decks.map((d) => [d.id, d.name]));
    const types = new Map(noteTypes.map((n) => [n.id, n]));
    // Search index, computed once per change of the card table.
    const entries: BrowseEntry[] = cards.map((card) => {
      const noteType = types.get(card.note_type_id);
      return {
        card,
        text: stripHtml(clozeToPlain(card.fields.join(" "))).toLowerCase(),
        title: stripHtml(clozeToPlain(card.fields[0] ?? "")),
        deckName: deckNames.get(card.deck_id) ?? "",
        cardType: templateName(card, noteType),
        templateBase: templateBase(card, noteType),
        noteTypeName: noteType?.name ?? "",
      };
    });
    return { entries, decks };
  }, []);

  const cardTypes = useMemo(() => cardTypeOptions(data?.entries ?? []), [data]);
  const statusCounts = useMemo(() => {
    const counts = Object.fromEntries(CARD_STATUSES.map((s) => [s, 0])) as Record<
      CardStatus,
      number
    >;
    if (now) for (const { card } of data?.entries ?? []) counts[statusOf(card, now)] += 1;
    return counts;
  }, [data, now]);

  const results = useMemo(() => {
    if (!data || !now) return [];
    return filterCards(
      data.entries,
      parseQuery(deferredQuery),
      {
        statuses: filters.statuses,
        deckIds: deckSubtree(data.decks, filters.deckId),
        cardTypes: filters.cardTypes,
      },
      now,
    );
  }, [data, deferredQuery, filters, now]);

  const updateFilters = (next: FilterState) => {
    setFilters(next);
    setLimit(PAGE);
  };
  const filterCount =
    filters.statuses.size + (filters.deckId === null ? 0 : 1) + filters.cardTypes.size;
  const deckName = data?.decks.find((d) => d.id === filters.deckId)?.name;

  const describe = (card: LocalCard) => {
    if (card.suspended) return t("stateSuspended");
    if (card.state === CardState.New) return t("stateNew");
    return card.due && now ? format.relativeTime(new Date(card.due), now) : "";
  };

  return (
    <NavigationPage
      title={t("title")}
      accessory={
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <label className="flex h-9 min-w-0 flex-1 items-center gap-1.5 rounded-[10px] bg-fill-3 px-2">
              <Search className="size-4 shrink-0 text-label-2" aria-hidden />
              <input
                type="search"
                value={query}
                placeholder={t("searchPlaceholder")}
                title={t("searchHint")}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setLimit(PAGE);
                }}
                className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-label-2"
              />
            </label>
            <button
              type="button"
              onClick={() => setFilterSheet(true)}
              aria-label={t("filters")}
              aria-haspopup="dialog"
              className={cn(
                "relative flex size-9 shrink-0 items-center justify-center rounded-full active:opacity-50",
                filterCount ? "bg-tint text-white" : "text-tint",
              )}
            >
              <ListFilter className="size-5" strokeWidth={2.2} aria-hidden />
              {filterCount ? (
                <span className="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-ios-red text-[10px] font-semibold text-white">
                  {filterCount}
                </span>
              ) : null}
            </button>
          </div>
          {filterCount ? (
            <div className="-mx-4 flex [scrollbar-width:none] gap-1.5 overflow-x-auto px-4">
              {[...filters.statuses].map((status) => (
                <Chip
                  key={status}
                  label={t("removeFilter", { name: t(STATUS_LABEL[status]) })}
                  onRemove={() => {
                    const statuses = new Set(filters.statuses);
                    statuses.delete(status);
                    updateFilters({ ...filters, statuses });
                  }}
                >
                  <StatusDot status={status} />
                  {t(STATUS_LABEL[status])}
                </Chip>
              ))}
              {deckName ? (
                <Chip
                  label={t("removeFilter", { name: deckName })}
                  onRemove={() => updateFilters({ ...filters, deckId: null })}
                >
                  <span className="truncate">{deckName.split("::").pop()}</span>
                </Chip>
              ) : null}
              {[...filters.cardTypes].map((name) => (
                <Chip
                  key={name}
                  label={t("removeFilter", { name })}
                  onRemove={() => {
                    const cardTypes = new Set(filters.cardTypes);
                    cardTypes.delete(name);
                    updateFilters({ ...filters, cardTypes });
                  }}
                >
                  <span className="truncate">{name}</span>
                </Chip>
              ))}
            </div>
          ) : null}
        </div>
      }
    >
      <div className="px-1 pb-2 text-footnote text-label-2">
        {t("results", { count: results.length })}
      </div>

      {data && now && results.length === 0 ? (
        <p className="py-16 text-center text-label-2">{t("noResults")}</p>
      ) : (
        <div className="overflow-hidden rounded-[10px] bg-grouped-2">
          {results.slice(0, limit).map(({ card, title, deckName, cardType }) => {
            const status = statusOf(card, now!);
            return (
              <ListRow
                key={card.id}
                icon={<StatusDot status={status} label={t(STATUS_LABEL[status])} />}
                title={title || "—"}
                subtitle={[cardType, deckName.split("::").pop()].filter(Boolean).join(" · ")}
                detail={<span className="text-footnote">{describe(card)}</span>}
                onClick={() => setSelected(card.id)}
                chevron
              />
            );
          })}
          {results.length > limit ? (
            <ListRow title="…" tinted onClick={() => setLimit((l) => l + PAGE)} />
          ) : null}
        </div>
      )}

      <FilterSheet
        open={filterSheet}
        onOpenChange={setFilterSheet}
        value={filters}
        onChange={updateFilters}
        decks={data?.decks ?? []}
        cardTypes={cardTypes}
        statusCounts={statusCounts}
      />
      <CardDetailSheet cardId={selected} onClose={() => setSelected(null)} />
    </NavigationPage>
  );
}
