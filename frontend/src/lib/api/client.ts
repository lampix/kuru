/** Minimal typed fetch wrapper for the Kuru API (same origin via the `/api` rewrite). */

import type {
  Activity,
  CardMemory,
  HistoryEntry,
  ImportJob,
  MediaEntry,
  Me,
  Preset,
  RecentReview,
  ReviewBatchResult,
  ReviewIn,
  Stats,
  StudyCard,
  SyncMeta,
} from "./types";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }

  get isUnauthorized(): boolean {
    return this.status === 401;
  }
}

/** Thrown when the network is unreachable (offline, server down). */
export class NetworkError extends Error {
  constructor(cause: unknown) {
    super("Network unavailable", { cause });
    this.name = "NetworkError";
  }
}

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      credentials: "same-origin",
      ...init,
      headers: {
        Accept: "application/json",
        ...(init.body && !(init.body instanceof FormData)
          ? { "Content-Type": "application/json" }
          : {}),
        ...init.headers,
      },
    });
  } catch (error) {
    throw new NetworkError(error);
  }
  if (!response.ok) {
    let detail = response.statusText;
    try {
      const body = (await response.json()) as { detail?: unknown };
      if (typeof body.detail === "string") detail = body.detail;
    } catch {
      // non-JSON error body
    }
    throw new ApiError(response.status, detail);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

const json = (body: unknown): RequestInit => ({ body: JSON.stringify(body) });
const query = (params: Record<string, string | number | null | undefined>) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined) search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : "";
};

export const api = {
  health: () => request<{ status: string; version: string }>("/health"),
  authInfo: () => request<{ requires_login: boolean }>("/auth/info"),
  login: (token: string) => request<Me>("/auth/login", { method: "POST", ...json({ token }) }),
  logout: () => request<void>("/auth/logout", { method: "POST" }),
  me: () => request<Me>("/auth/me"),
  updateMe: (body: Partial<Pick<Me, "timezone" | "day_rollover_hour">>) =>
    request<Me>("/auth/me", { method: "PATCH", ...json(body) }),

  sync: {
    pushReviews: (reviews: ReviewIn[]) =>
      request<ReviewBatchResult>("/sync/reviews", { method: "POST", ...json({ reviews }) }),
    meta: () => request<SyncMeta>("/sync/meta"),
    cards: (params: { since?: string | null; after_id?: number; limit?: number }) =>
      request<{ cards: StudyCard[]; next_after_id: number | null }>(`/sync/cards${query(params)}`),
    cardIds: () => request<{ card_ids: number[] }>("/sync/card-ids"),
    reviews: (since: string) => request<RecentReview[]>(`/sync/reviews${query({ since })}`),
    media: () => request<MediaEntry[]>("/sync/media"),
  },

  undoReview: (id: string) =>
    request<CardMemory>(`/reviews/${encodeURIComponent(id)}`, { method: "DELETE" }),
  cardActions: (card_ids: number[], action: string, deck_id?: number) =>
    request<CardMemory[]>("/cards/actions", {
      method: "POST",
      ...json({ card_ids, action, deck_id }),
    }),

  presets: {
    list: () => request<Preset[]>("/presets"),
    create: (body: Partial<Preset> & { name: string; copy_from?: number }) =>
      request<Preset>("/presets", { method: "POST", ...json(body) }),
    update: (id: number, body: Partial<Preset>) =>
      request<Preset>(`/presets/${id}`, { method: "PATCH", ...json(body) }),
    remove: (id: number) => request<void>(`/presets/${id}`, { method: "DELETE" }),
    optimize: (id: number, apply: boolean) =>
      request<{
        weights: number[];
        review_count: number;
        applied: boolean;
        rescheduled_cards: number;
      }>(`/presets/${id}/optimize${query({ apply: String(apply) })}`, { method: "POST" }),
  },

  decks: {
    remove: (id: number) => request<void>(`/decks/${id}`, { method: "DELETE" }),
    update: (
      id: number,
      body: { name?: string; description?: string; config_id?: number | null },
    ) => request<unknown>(`/decks/${id}`, { method: "PATCH", ...json(body) }),
  },

  stats: (deckId?: number | null) => request<Stats>(`/stats${query({ deck_id: deckId ?? null })}`),
  statsActivity: (start: string, end: string, deckId?: number | null) =>
    request<Activity>(`/stats/activity${query({ start, end, deck_id: deckId ?? null })}`),
  cardHistory: (cardId: number) => request<HistoryEntry[]>(`/cards/${cardId}/history`),

  imports: {
    status: (id: string) => request<ImportJob>(`/import/status/${id}`),
    jobs: () => request<ImportJob[]>("/import/jobs"),
  },
};
