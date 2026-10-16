/**
 * Card browser search and filters. Pure functions over IndexedDB rows, so the browser works
 * offline. The search syntax follows Anki's: `deck:`, `card:`, `is:` and `tag:` terms, `*`
 * wildcards and double quotes around values with spaces (`deck:"Japanese - Kana"`).
 */

import type { NoteType } from "@/lib/api/types";
import type { LocalCard } from "@/lib/db";
import { CardState } from "@/lib/fsrs";

export type CardStatus = "new" | "learning" | "review" | "suspended" | "buried";

export const CARD_STATUSES: readonly CardStatus[] = [
  "new",
  "learning",
  "review",
  "suspended",
  "buried",
];

/** Dot colours, matching the deck counts (new blue, learning red, review green). */
export const STATUS_COLOR: Record<CardStatus, string> = {
  new: "bg-ios-blue",
  learning: "bg-ios-red",
  review: "bg-ios-green",
  suspended: "bg-ios-yellow",
  buried: "bg-ios-gray",
};

type StatusFields = Pick<LocalCard, "suspended" | "buried_until" | "state">;

/** Suspended wins over buried, buried over the FSRS state; relearning counts as learning. */
export function statusOf(card: StatusFields, now: Date): CardStatus {
  if (card.suspended) return "suspended";
  if (card.buried_until && new Date(card.buried_until) > now) return "buried";
  switch (card.state) {
    case CardState.New:
      return "new";
    case CardState.Review:
      return "review";
    default:
      return "learning";
  }
}

type NoteTypeFields = Pick<NoteType, "kind" | "templates">;

/** The template a card was generated from ("Card 1", "Hiragana"). Cloze cards add their number. */
export function templateName(card: Pick<LocalCard, "ord">, noteType?: NoteTypeFields): string {
  if (!noteType) return "";
  if (noteType.kind === 1) return `${noteType.templates[0]?.name ?? "Cloze"} ${card.ord + 1}`;
  return noteType.templates.find((t) => t.ord === card.ord)?.name ?? `${card.ord + 1}`;
}

/** The template name without the cloze number, so `card:Cloze` matches every cloze card. */
export function templateBase(card: Pick<LocalCard, "ord">, noteType?: NoteTypeFields): string {
  if (noteType?.kind === 1) return noteType.templates[0]?.name ?? "Cloze";
  return templateName(card, noteType);
}

export type SearchTerm =
  { kind: "text"; value: string } | { kind: "tag" | "deck" | "card" | "is"; value: string };

const PREFIXED = /^(tag|deck|card|is):(.*)$/i;

/** Splits a query into lowercase terms; quotes keep spaces inside one term and are dropped. */
export function parseQuery(query: string): SearchTerm[] {
  const tokens: string[] = [];
  let current = "";
  let quoted = false;
  for (const char of query) {
    if (char === '"') quoted = !quoted;
    else if (/\s/.test(char) && !quoted) {
      if (current) tokens.push(current);
      current = "";
    } else current += char;
  }
  if (current) tokens.push(current);

  return tokens.flatMap((token): SearchTerm[] => {
    const match = PREFIXED.exec(token);
    if (!match) return [{ kind: "text", value: token.toLowerCase() }];
    const value = match[2]!.trim().toLowerCase();
    return value ? [{ kind: match[1]!.toLowerCase() as "tag", value }] : [];
  });
}

/** Anki-style `*` wildcard match on the whole name (case-insensitive, `value` is lowercase). */
function wildcard(value: string, suffix = ""): RegExp {
  const escaped = value.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replaceAll("*", ".*");
  return new RegExp(`^${escaped}${suffix}$`, "i");
}

/** A card with the values the browser searches and shows, computed once per table change. */
export interface BrowseEntry {
  card: LocalCard;
  /** Lowercase plain text of all fields. */
  text: string;
  title: string;
  /** Full deck name (`Parent::Child`). */
  deckName: string;
  /** Display name of the card type (template). */
  cardType: string;
  /** Template name without the cloze number. */
  templateBase: string;
  noteTypeName: string;
}

export interface BrowseFilters {
  /** Empty means every status. */
  statuses: ReadonlySet<CardStatus>;
  /** Deck plus its sub-decks; `null` means every deck. */
  deckIds: ReadonlySet<number> | null;
  /** Card type names; empty means every card type. */
  cardTypes: ReadonlySet<string>;
}

export const NO_FILTERS: BrowseFilters = {
  statuses: new Set(),
  deckIds: null,
  cardTypes: new Set(),
};

/** Ids of a deck and all its sub-decks. */
export function deckSubtree(
  decks: ReadonlyArray<{ id: number; name: string }>,
  deckId: number | null,
): Set<number> | null {
  const root = decks.find((d) => d.id === deckId);
  if (!root) return null;
  return new Set(
    decks.filter((d) => d.id === root.id || d.name.startsWith(`${root.name}::`)).map((d) => d.id),
  );
}

function matchesTerm(entry: BrowseEntry, term: SearchTerm, now: Date): boolean {
  switch (term.kind) {
    case "text":
      return entry.text.includes(term.value);
    case "tag":
      return entry.card.tags.some((tag) => wildcard(term.value).test(tag));
    case "deck":
      return wildcard(term.value, "(::.*)?").test(entry.deckName);
    case "card":
      if (/^\d+$/.test(term.value)) return entry.card.ord + 1 === Number(term.value);
      return (
        wildcard(term.value).test(entry.cardType) || wildcard(term.value).test(entry.templateBase)
      );
    case "is": {
      // `is:learn` and partially typed values (`is:sus`) match by prefix.
      return statusOf(entry.card, now).startsWith(term.value);
    }
  }
}

export function filterCards(
  entries: readonly BrowseEntry[],
  terms: readonly SearchTerm[],
  filters: BrowseFilters,
  now: Date,
): BrowseEntry[] {
  return entries.filter((entry) => {
    if (filters.deckIds && !filters.deckIds.has(entry.card.deck_id)) return false;
    if (filters.cardTypes.size && !filters.cardTypes.has(entry.cardType)) return false;
    if (filters.statuses.size && !filters.statuses.has(statusOf(entry.card, now))) return false;
    return terms.every((term) => matchesTerm(entry, term, now));
  });
}

export interface CardTypeOption {
  name: string;
  count: number;
  /** Note types using this template name, for telling identical names apart. */
  noteTypes: string[];
}

/** The card types present among `entries`, sorted by name. */
export function cardTypeOptions(entries: readonly BrowseEntry[]): CardTypeOption[] {
  const options = new Map<string, { count: number; noteTypes: Set<string> }>();
  for (const { cardType, noteTypeName } of entries) {
    if (!cardType) continue;
    const option = options.get(cardType) ?? { count: 0, noteTypes: new Set() };
    option.count += 1;
    option.noteTypes.add(noteTypeName);
    options.set(cardType, option);
  }
  return [...options]
    .map(([name, { count, noteTypes }]) => ({ name, count, noteTypes: [...noteTypes].sort() }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
}
