/** Types mirroring the backend's OpenAPI schemas (`backend/src/kuru/schemas`). */

import type { MemoryState } from "@/lib/fsrs";

export interface CardMemory extends MemoryState {
  suspended: boolean;
  buried_until: string | null;
}

export interface StudyCard {
  id: number;
  note_id: number;
  deck_id: number;
  ord: number;
  note_type_id: number;
  fields: string[];
  tags: string[];
  memory: CardMemory;
  position: number;
  flags: number;
}

export interface NoteType {
  id: number;
  name: string;
  kind: number;
  fields: Array<{ name: string; ord: number }>;
  templates: Array<{ name: string; ord: number; qfmt: string; afmt: string }>;
  css: string;
  updated_at: string;
}

export type NewCardOrder = "sequential" | "random";

export interface Preset {
  id: number;
  name: string;
  desired_retention: number;
  maximum_interval: number;
  fsrs_weights: number[];
  weights_are_default: boolean;
  learning_steps: number[];
  relearning_steps: number[];
  enable_fuzz: boolean;
  new_per_day: number;
  reviews_per_day: number;
  new_card_order: NewCardOrder;
  bury_new: boolean;
  bury_reviews: boolean;
  bury_interday_learning: boolean;
  autoplay_audio: boolean;
  show_answer_timer: number;
  deck_count: number;
  is_default: boolean;
  updated_at: string;
}

export interface SyncDeck {
  id: number;
  name: string;
  description: string;
  config_id: number | null;
  updated_at: string;
}

export interface SyncMeta {
  server_time: string;
  timezone: string;
  day_rollover_hour: number;
  decks: SyncDeck[];
  presets: Preset[];
  note_types: NoteType[];
  card_count: number;
}

export interface ReviewIn {
  id: string;
  card_id: number;
  rating: number;
  reviewed_at: string;
  duration_ms: number | null;
}

export interface ReviewBatchResult {
  accepted: string[];
  duplicates: string[];
  rejected: Record<string, string>;
  cards: CardMemory[];
  server_time: string;
}

export interface RecentReview {
  id: string;
  card_id: number;
  rating: number;
  reviewed_at: string;
  kind: number;
  was_new: boolean;
  duration_ms: number | null;
}

export interface MediaEntry {
  filename: string;
  sha256: string;
  size: number;
  mime_type: string;
  updated_at: string;
}

export type ImportStatus = "pending" | "processing" | "completed" | "failed";

export interface ImportJob {
  id: string;
  filename: string;
  status: ImportStatus;
  stage: string;
  progress: number;
  message: string | null;
  stats: Record<string, number | boolean>;
  created_at: string;
  finished_at: string | null;
}

export interface Me {
  id: number;
  name: string;
  timezone: string;
  day_rollover_hour: number;
}
