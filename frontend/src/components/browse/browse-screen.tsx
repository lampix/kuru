"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { Search } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useDeferredValue, useMemo, useState } from "react";

import { ListRow, NavigationPage, SegmentedControl } from "@/components/ios";
import { useNow } from "@/hooks/use-now";
import { db, type LocalCard } from "@/lib/db";
import { CardState } from "@/lib/fsrs";
import { clozeToPlain } from "@/lib/render/cloze";
import { stripHtml } from "@/lib/render/html";

import { CardDetailSheet } from "./card-detail-sheet";

type StateFilter = "all" | "new" | "learning" | "review" | "suspended";
const PAGE = 100;

function matchesState(card: LocalCard, filter: StateFilter): boolean {
  switch (filter) {
    case "all":
      return true;
    case "suspended":
      return card.suspended;
    case "new":
      return !card.suspended && card.state === CardState.New;
    case "learning":
      return (
        !card.suspended &&
        (card.state === CardState.Learning || card.state === CardState.Relearning)
      );
    case "review":
      return !card.suspended && card.state === CardState.Review;
  }
}

/** Searchable list of all cards — works offline on IndexedDB. */
export function BrowseScreen() {
  const t = useTranslations("browse");
  const format = useFormatter();
  const [query, setQuery] = useState("");
  const [state, setState] = useState<StateFilter>("all");
  const [deckId, setDeckId] = useState<number | null>(null);
  const [limit, setLimit] = useState(PAGE);
  const [selected, setSelected] = useState<number | null>(null);
  const deferredQuery = useDeferredValue(query);
  const now = useNow(60_000);

  const data = useLiveQuery(async () => {
    const [cards, decks] = await Promise.all([
      db.cards.toArray(),
      db.decks.orderBy("name").toArray(),
    ]);
    return {
      // Plain-text search index, computed once per change of the card table.
      cards: cards.map((card) => ({
        card,
        text: stripHtml(clozeToPlain(card.fields.join(" "))).toLowerCase(),
        title: stripHtml(clozeToPlain(card.fields[0] ?? "")),
      })),
      decks,
    };
  }, []);

  const deckNames = useMemo(() => new Map(data?.decks.map((d) => [d.id, d.name]) ?? []), [data]);
  const deckFilter = useMemo(() => {
    const root = data?.decks.find((d) => d.id === deckId);
    if (!root || !data) return null;
    return new Set(
      data.decks
        .filter((d) => d.id === root.id || d.name.startsWith(`${root.name}::`))
        .map((d) => d.id),
    );
  }, [data, deckId]);

  const results = useMemo(() => {
    if (!data) return [];
    const terms = deferredQuery.toLowerCase().split(/\s+/).filter(Boolean);
    return data.cards.filter(({ card, text }) => {
      if (deckFilter && !deckFilter.has(card.deck_id)) return false;
      if (!matchesState(card, state)) return false;
      return terms.every((term) =>
        term.startsWith("tag:")
          ? card.tags.some((tag) => tag.toLowerCase() === term.slice(4))
          : text.includes(term),
      );
    });
  }, [data, deferredQuery, deckFilter, state]);

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
          <label className="flex h-9 items-center gap-1.5 rounded-[10px] bg-fill-3 px-2">
            <Search className="size-4 text-label-2" aria-hidden />
            <input
              type="search"
              value={query}
              placeholder={t("searchPlaceholder")}
              onChange={(e) => {
                setQuery(e.target.value);
                setLimit(PAGE);
              }}
              className="flex-1 bg-transparent outline-none placeholder:text-label-2"
            />
          </label>
          <SegmentedControl
            ariaLabel={t("title")}
            value={state}
            onChange={(value) => {
              setState(value);
              setLimit(PAGE);
            }}
            options={[
              { value: "all", label: t("stateAll") },
              { value: "new", label: t("stateNew") },
              { value: "learning", label: t("stateLearning") },
              { value: "review", label: t("stateReview") },
              { value: "suspended", label: t("stateSuspended") },
            ]}
          />
        </div>
      }
    >
      <div className="flex items-center justify-between px-1 pb-2 text-footnote text-label-2">
        <span>{t("results", { count: results.length })}</span>
        <select
          value={deckId ?? ""}
          onChange={(e) => setDeckId(e.target.value ? Number(e.target.value) : null)}
          className="max-w-[60%] bg-transparent text-right text-tint outline-none"
          aria-label={t("deck")}
        >
          <option value="">{t("allDecks")}</option>
          {data?.decks.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name.replaceAll("::", " › ")}
            </option>
          ))}
        </select>
      </div>

      {data && results.length === 0 ? (
        <p className="py-16 text-center text-label-2">{t("noResults")}</p>
      ) : (
        <div className="overflow-hidden rounded-[10px] bg-grouped-2">
          {results.slice(0, limit).map(({ card, title }) => (
            <ListRow
              key={card.id}
              title={title || "—"}
              subtitle={deckNames.get(card.deck_id)?.split("::").pop()}
              detail={<span className="text-footnote">{describe(card)}</span>}
              onClick={() => setSelected(card.id)}
              chevron
            />
          ))}
          {results.length > limit ? (
            <ListRow title="…" tinted onClick={() => setLimit((l) => l + PAGE)} />
          ) : null}
        </div>
      )}

      <CardDetailSheet cardId={selected} onClose={() => setSelected(null)} />
    </NavigationPage>
  );
}
