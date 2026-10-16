import { describe, expect, it } from "vitest";

import type { LocalCard } from "@/lib/db";
import { CardState } from "@/lib/fsrs";

import {
  type BrowseEntry,
  NO_FILTERS,
  cardTypeOptions,
  deckSubtree,
  filterCards,
  parseQuery,
  statusOf,
  templateBase,
  templateName,
} from "./filter";

const now = new Date("2026-10-16T12:00:00Z");

const kana = {
  kind: 0,
  templates: [
    { name: "Hiragana", ord: 0, qfmt: "", afmt: "" },
    { name: "Katakana", ord: 1, qfmt: "", afmt: "" },
  ],
};
const cloze = { kind: 1, templates: [{ name: "Cloze", ord: 0, qfmt: "", afmt: "" }] };

const decks = [
  { id: 1, name: "Japanese - Kana" },
  { id: 2, name: "Japanese - Kana::Dakuten" },
  { id: 3, name: "Japanese - Kanji" },
];

function card(overrides: Partial<LocalCard> = {}): LocalCard {
  return {
    id: 1,
    note_id: 1,
    deck_id: 1,
    ord: 0,
    note_type_id: 1,
    fields: ["あ", "a"],
    tags: ["hiragana"],
    position: 0,
    flags: 0,
    state: CardState.Review,
    step: 0,
    stability: 10,
    difficulty: 5,
    due: "2026-10-20T00:00:00Z",
    last_review: null,
    reps: 3,
    lapses: 0,
    suspended: false,
    buried_until: null,
    ...overrides,
  } as LocalCard;
}

function entry(c: LocalCard, noteType = kana, noteTypeName = "Kana"): BrowseEntry {
  const deckName = decks.find((d) => d.id === c.deck_id)!.name;
  return {
    card: c,
    text: c.fields.join(" ").toLowerCase(),
    title: c.fields[0]!,
    deckName,
    cardType: templateName(c, noteType),
    templateBase: templateBase(c, noteType),
    noteTypeName,
  };
}

const entries = [
  entry(card({ id: 1, ord: 0 })),
  entry(card({ id: 2, ord: 1, state: CardState.New })),
  entry(card({ id: 3, ord: 0, deck_id: 2, suspended: true })),
  entry(card({ id: 4, ord: 1, deck_id: 3, state: CardState.Relearning })),
];
const ids = (list: BrowseEntry[]) => list.map((e) => e.card.id);

describe("statusOf", () => {
  it("prefers suspended over buried over the FSRS state", () => {
    const buried = { buried_until: "2026-10-17T00:00:00Z" };
    expect(statusOf(card({ suspended: true, ...buried }), now)).toBe("suspended");
    expect(statusOf(card(buried), now)).toBe("buried");
    expect(statusOf(card({ buried_until: "2026-10-15T00:00:00Z" }), now)).toBe("review");
    expect(statusOf(card({ state: CardState.Relearning }), now)).toBe("learning");
    expect(statusOf(card({ state: CardState.New }), now)).toBe("new");
  });
});

describe("templateName", () => {
  it("names standard cards by template and cloze cards by number", () => {
    expect(templateName(card({ ord: 1 }), kana)).toBe("Katakana");
    expect(templateName(card({ ord: 2 }), cloze)).toBe("Cloze 3");
    expect(templateName(card(), undefined)).toBe("");
  });
});

describe("parseQuery", () => {
  it("keeps quoted values together and lowercases terms", () => {
    expect(parseQuery('"deck:Japanese - Kana" card:Hiragana Foo')).toEqual([
      { kind: "deck", value: "japanese - kana" },
      { kind: "card", value: "hiragana" },
      { kind: "text", value: "foo" },
    ]);
    expect(parseQuery('deck:"Japanese - Kana"')).toEqual([
      { kind: "deck", value: "japanese - kana" },
    ]);
    expect(parseQuery("deck: is:")).toEqual([]);
  });
});

describe("filterCards", () => {
  const search = (q: string) => ids(filterCards(entries, parseQuery(q), NO_FILTERS, now));

  it("matches decks with their sub-decks and wildcards", () => {
    expect(search('deck:"Japanese - Kana"')).toEqual([1, 2, 3]);
    expect(search("deck:japanese*")).toEqual([1, 2, 3, 4]);
    expect(search('deck:"Japanese - Kana::Dakuten"')).toEqual([3]);
  });

  it("tells paired card types of the same note apart", () => {
    expect(search("card:Hiragana")).toEqual([1, 3]);
    expect(search("card:katakana")).toEqual([2, 4]);
    expect(search("card:2")).toEqual([2, 4]);
  });

  it("filters by status, also by prefix", () => {
    expect(search("is:new")).toEqual([2]);
    expect(search("is:learn")).toEqual([4]);
    expect(search("is:sus")).toEqual([3]);
  });

  it("combines search terms with filters", () => {
    const filters = {
      statuses: new Set(["review", "suspended"] as const),
      deckIds: deckSubtree(decks, 1),
      cardTypes: new Set(["Hiragana"]),
    };
    expect(ids(filterCards(entries, parseQuery(""), filters, now))).toEqual([1, 3]);
    expect(ids(filterCards(entries, parseQuery("is:review"), filters, now))).toEqual([1]);
    expect(ids(filterCards(entries, parseQuery("tag:hira*"), filters, now))).toEqual([1, 3]);
  });
});

describe("cardTypeOptions", () => {
  const search = (q: string) => ids(filterCards(entries, parseQuery(q), NO_FILTERS, now));

  it("counts card types and lists their note types", () => {
    const withCloze = [...entries, entry(card({ id: 5, ord: 0 }), cloze, "Cloze")];
    expect(search("card:cloze")).toEqual([]);
    expect(ids(filterCards(withCloze, parseQuery("card:cloze"), NO_FILTERS, now))).toEqual([5]);
    expect(cardTypeOptions(withCloze)).toEqual([
      { name: "Cloze 1", count: 1, noteTypes: ["Cloze"] },
      { name: "Hiragana", count: 2, noteTypes: ["Kana"] },
      { name: "Katakana", count: 2, noteTypes: ["Kana"] },
    ]);
  });
});
