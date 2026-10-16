"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { Circle, CircleCheck, ListFilter, Search, X } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { type ReactNode, useDeferredValue, useEffect, useMemo, useState } from "react";

import { BarButton, ListRow, NavigationPage, useToast } from "@/components/ios";
import { useNow } from "@/hooks/use-now";
import { useOnline } from "@/hooks/use-online";
import { type SuspendAction, setSuspended, toggleAction } from "@/lib/browse/actions";
import {
  type BrowseEntry,
  type BrowseFilters,
  cardTypesIn,
  deckSubtree,
  facetCounts,
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
  const common = useTranslations("common");
  const format = useFormatter();
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [filterSheet, setFilterSheet] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const [selected, setSelected] = useState<number | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<ReadonlySet<number>>(new Set());
  // Cards just acted on stay listed until the search changes, like in Anki, so an action can be
  // undone even when the cards no longer match (e.g. suspending under a "Review" filter).
  const [kept, setKept] = useState<ReadonlySet<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const deferredQuery = useDeferredValue(query);
  const now = useNow(60_000);
  const online = useOnline();
  const { toast, show } = useToast({ aboveToolbar: selecting });

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

  const search = useMemo(() => {
    const browseFilters: BrowseFilters = {
      statuses: filters.statuses,
      deckIds: deckSubtree(data?.decks ?? [], filters.deckId),
      cardTypes: filters.cardTypes,
    };
    return { terms: parseQuery(deferredQuery), filters: browseFilters };
  }, [data, deferredQuery, filters]);

  // Option counts for the filter sheet.
  const counts = useMemo(
    () =>
      facetCounts(
        data?.entries ?? [],
        search.terms,
        search.filters,
        data?.decks ?? [],
        now ?? new Date(0),
      ),
    [data, now, search],
  );

  const results = useMemo(() => {
    if (!data || !now) return [];
    const matches = filterCards(data.entries, search.terms, search.filters, now);
    if (!kept.size) return matches;
    const ids = new Set(matches.map((e) => e.card.id));
    return data.entries.filter((e) => ids.has(e.card.id) || kept.has(e.card.id));
  }, [data, search, now, kept]);

  // Actions only ever apply to selected cards that are part of the current (filtered) results.
  const selection = useMemo(
    () => results.filter((e) => picked.has(e.card.id)).map((e) => e.card),
    [results, picked],
  );

  const updateFilters = (next: FilterState) => {
    // A new deck drops selected card types it does not contain.
    if (data && next.deckId !== filters.deckId && next.cardTypes.size) {
      const available = cardTypesIn(data.entries, deckSubtree(data.decks, next.deckId));
      next = { ...next, cardTypes: new Set([...next.cardTypes].filter((n) => available.has(n))) };
    }
    setFilters(next);
    setLimit(PAGE);
    setKept(new Set());
  };

  const endSelecting = () => {
    setSelecting(false);
    setPicked(new Set());
  };

  const togglePicked = (id: number) =>
    setPicked((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const run = async (action: SuspendAction, ids: number[]) => {
    if (!ids.length || busy) return;
    if (!navigator.onLine) {
      show(t("offlineHint"), "error");
      return;
    }
    setBusy(true);
    try {
      await setSuspended(ids, action);
      setKept((current) => new Set([...current, ...ids]));
      show(t(action === "suspend" ? "suspendedToast" : "unsuspendedToast", { count: ids.length }));
    } catch (err) {
      show(err instanceof Error ? err.message : String(err), "error");
    } finally {
      setBusy(false);
    }
  };

  // Anki's shortcuts: Cmd/Ctrl+J toggles suspend, Cmd/Ctrl+A selects every filtered card.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return;
      const key = event.key.toLowerCase();
      if (key === "j") {
        const open =
          selected === null ? undefined : data?.entries.find((e) => e.card.id === selected);
        const cards = open ? [open.card] : selecting ? selection : [];
        if (!cards.length) return;
        event.preventDefault();
        void run(
          toggleAction(cards),
          cards.map((c) => c.id),
        );
      } else if (key === "a" && selecting && selected === null) {
        if (event.target instanceof HTMLInputElement) return;
        event.preventDefault();
        setPicked(new Set(results.map((e) => e.card.id)));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
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
      trailing={
        selecting ? (
          <BarButton bold onClick={endSelecting}>
            {common("done")}
          </BarButton>
        ) : (
          <BarButton onClick={() => setSelecting(true)}>{t("select")}</BarButton>
        )
      }
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
                  setKept(new Set());
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
        {selecting ? ` · ${t("selected", { count: selection.length })}` : null}
      </div>

      {data && now && results.length === 0 ? (
        <p className="py-16 text-center text-label-2">{t("noResults")}</p>
      ) : (
        <div className="overflow-hidden rounded-[10px] bg-grouped-2">
          {results.slice(0, limit).map(({ card, title, deckName, cardType }) => {
            const status = statusOf(card, now!);
            const dot = <StatusDot status={status} label={t(STATUS_LABEL[status])} />;
            return (
              <ListRow
                key={card.id}
                icon={
                  selecting ? (
                    <span className="flex items-center gap-3">
                      {picked.has(card.id) ? (
                        <CircleCheck className="size-[22px] fill-tint text-white" aria-hidden />
                      ) : (
                        <Circle className="size-[22px] text-label-3" aria-hidden />
                      )}
                      {dot}
                    </span>
                  ) : (
                    dot
                  )
                }
                title={title || "—"}
                subtitle={[cardType, deckName.split("::").pop()].filter(Boolean).join(" · ")}
                detail={<span className="text-footnote">{describe(card)}</span>}
                onClick={() => (selecting ? togglePicked(card.id) : setSelected(card.id))}
                chevron={!selecting}
              />
            );
          })}
          {results.length > limit ? (
            <ListRow title="…" tinted onClick={() => setLimit((l) => l + PAGE)} />
          ) : null}
        </div>
      )}

      {selecting ? (
        <>
          {/* Keeps the last rows reachable above the toolbar. */}
          <div className="h-16" aria-hidden />
          <div
            role="toolbar"
            aria-label={t("selected", { count: selection.length })}
            className="fixed inset-x-0 bottom-[calc(49px+env(safe-area-inset-bottom))] z-30 glass hairline-t"
          >
            {!online ? (
              <p className="px-4 pt-2 text-center text-footnote text-label-2">{t("offlineHint")}</p>
            ) : null}
            <div className="mx-auto flex h-11 max-w-3xl items-center gap-1 px-2 text-subhead">
              {selection.length === results.length && results.length > 0 ? (
                <BarButton onClick={() => setPicked(new Set())}>{t("deselectAll")}</BarButton>
              ) : (
                <BarButton
                  disabled={!results.length}
                  onClick={() => setPicked(new Set(results.map((e) => e.card.id)))}
                >
                  {t("selectAll")}
                </BarButton>
              )}
              <span className="flex-1" />
              <BarButton
                disabled={!online || busy || !selection.some((c) => !c.suspended)}
                onClick={() =>
                  void run(
                    "suspend",
                    selection.filter((c) => !c.suspended).map((c) => c.id),
                  )
                }
              >
                {t("suspend")}
              </BarButton>
              <BarButton
                disabled={!online || busy || !selection.some((c) => c.suspended)}
                onClick={() =>
                  void run(
                    "unsuspend",
                    selection.filter((c) => c.suspended).map((c) => c.id),
                  )
                }
              >
                {t("unsuspend")}
              </BarButton>
            </div>
          </div>
        </>
      ) : null}
      {toast}

      <FilterSheet
        open={filterSheet}
        onOpenChange={setFilterSheet}
        value={filters}
        onChange={updateFilters}
        decks={data?.decks ?? []}
        counts={counts}
      />
      <CardDetailSheet cardId={selected} onClose={() => setSelected(null)} />
    </NavigationPage>
  );
}
