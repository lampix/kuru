/**
 * Offline storage (IndexedDB via Dexie). The schema is intentionally flat: everything the review
 * screen needs is available without a network connection.
 */

import Dexie, { type EntityTable } from "dexie";

import type { CardMemory, NoteType, Preset, ReviewIn, SyncDeck } from "@/lib/api/types";

/** A card with its note content and memory state flattened for indexing. */
export interface LocalCard extends CardMemory {
  id: number;
  note_id: number;
  deck_id: number;
  ord: number;
  note_type_id: number;
  fields: string[];
  tags: string[];
  position: number;
  flags: number;
}

/** A review waiting to be uploaded. */
export interface OutboxEntry extends ReviewIn {
  created_at: number;
  attempts: number;
}

/** Recent reviews (local and pulled) used for daily limits and undo. */
export interface LocalReview {
  id: string;
  card_id: number;
  rating: number;
  reviewed_at: string;
  kind: number;
  was_new: boolean;
  duration_ms: number | null;
}

export interface MetaEntry {
  key: string;
  value: unknown;
}

export class KuruDatabase extends Dexie {
  cards!: EntityTable<LocalCard, "id">;
  decks!: EntityTable<SyncDeck, "id">;
  presets!: EntityTable<Preset, "id">;
  noteTypes!: EntityTable<NoteType, "id">;
  outbox!: EntityTable<OutboxEntry, "id">;
  reviews!: EntityTable<LocalReview, "id">;
  meta!: EntityTable<MetaEntry, "key">;

  constructor(name = "kuru") {
    super(name);
    this.version(1).stores({
      cards: "id, deck_id, note_id, state, due",
      decks: "id, name",
      presets: "id",
      noteTypes: "id",
      outbox: "id, card_id, created_at",
      reviews: "id, card_id, reviewed_at",
      meta: "key",
    });
  }
}

export const db = new KuruDatabase();

export async function getMeta<T>(key: string): Promise<T | undefined> {
  return (await db.meta.get(key))?.value as T | undefined;
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await db.meta.put({ key, value });
}

export const META = {
  lastSync: "lastSync",
  timezone: "timezone",
  rolloverHour: "rolloverHour",
  locale: "locale",
  mediaManifest: "mediaManifest",
  requiresLogin: "requiresLogin",
} as const;
