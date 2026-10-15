"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { CloudOff } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { BarChart, StatTile } from "@/components/charts/bar-chart";
import { ListSection, NavigationPage, SelectRow } from "@/components/ios";
import { ActivitySection } from "@/components/stats/activity-section";
import { api } from "@/lib/api/client";
import type { Stats } from "@/lib/api/types";
import { db } from "@/lib/db";
import { useSyncStatus } from "@/lib/sync/hooks";

const STATE_DOT: Record<string, string> = {
  new: "var(--ios-blue)",
  learning: "var(--ios-red)",
  relearning: "var(--ios-orange)",
  review: "var(--ios-green)",
  suspended: "var(--ios-gray)",
};

const STATE_LABEL = {
  new: "stateNew",
  learning: "stateLearning",
  relearning: "stateRelearning",
  review: "stateReview",
  suspended: "stateSuspended",
} as const;

export function StatsScreen() {
  const t = useTranslations("stats");
  const browse = useTranslations("browse");
  const common = useTranslations("common");
  const format = useFormatter();
  const decks = useLiveQuery(() => db.decks.orderBy("name").toArray(), []);
  const { lastSync } = useSyncStatus();
  const [deckId, setDeckId] = useState<number | null>(null);
  const [result, setResult] = useState<{
    key: string;
    stats: Stats | null;
    failed: boolean;
  } | null>(null);

  // Refetch when the deck filter changes or after a sync brought new reviews.
  const key = `${deckId ?? "all"}:${lastSync ?? ""}`;
  useEffect(() => {
    let cancelled = false;
    api.stats(deckId).then(
      (stats) => !cancelled && setResult({ key, stats, failed: false }),
      () => !cancelled && setResult({ key, stats: null, failed: true }),
    );
    return () => {
      cancelled = true;
    };
  }, [deckId, key]);

  const stats = result?.stats ?? null;
  const day = (iso: string) =>
    format.dateTime(new Date(`${iso}T12:00:00`), { month: "short", day: "numeric" });
  const percent = (value: number | null) =>
    value === null ? "–" : format.number(value, { style: "percent", maximumFractionDigits: 1 });
  const minutes = (ms: number) => format.number(ms / 60000, { maximumFractionDigits: 0 });

  return (
    <NavigationPage title={t("title")}>
      <div className="mt-2 overflow-hidden rounded-[10px] bg-grouped-2">
        <SelectRow
          title={browse("deck")}
          value={deckId ?? ""}
          onChange={(e) => setDeckId(e.target.value ? Number(e.target.value) : null)}
        >
          <option value="">{browse("allDecks")}</option>
          {decks?.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name.replaceAll("::", " › ")}
            </option>
          ))}
        </SelectRow>
      </div>

      {result?.failed ? (
        <div className="flex flex-col items-center gap-3 py-20 text-center text-label-2">
          <CloudOff className="size-10" strokeWidth={1.5} aria-hidden />
          <p>{t("offlineHint")}</p>
        </div>
      ) : !stats ? (
        <p className="py-20 text-center text-label-2" role="status">
          …
        </p>
      ) : (
        <>
          <h2 className="mt-6 mb-2 px-1 text-title-3 font-semibold">{t("today")}</h2>
          <div className="grid grid-cols-2 gap-2.5">
            <StatTile label={browse("reviews")} value={format.number(stats.today.reviews)} />
            <StatTile label={t("timeToday")} value={`${minutes(stats.today.duration_ms)} min`} />
            <StatTile
              label={t("retention")}
              value={percent(stats.retention)}
              hint={t("retentionHint")}
            />
            <StatTile label={t("streak")} value={common("days", { count: stats.streak })} />
          </div>

          <ActivitySection
            deckId={deckId}
            refreshKey={key}
            today={stats.today.day}
            recent={stats.activity}
          />

          <ListSection header={t("forecast")} footer={t("forecastHint")}>
            <div className="px-4 pt-2 pb-3">
              <BarChart
                title={t("forecast")}
                data={stats.forecast.map((f) => ({
                  key: f.day,
                  label: day(f.day),
                  value: f.count,
                }))}
              />
            </div>
          </ListSection>

          <ListSection header={t("cardStates")}>
            {(["new", "learning", "relearning", "review", "suspended"] as const).map((state) => (
              <div key={state} className="group/row flex items-center">
                <div className="flex min-h-11 flex-1 items-center gap-3 pr-4 pl-4 hairline-b group-last/row:shadow-none">
                  <span
                    className="size-2.5 rounded-full"
                    style={{ backgroundColor: STATE_DOT[state] }}
                    aria-hidden
                  />
                  <span className="flex-1">{browse(STATE_LABEL[state])}</span>
                  <span className="text-label-2 tabular-nums">
                    {format.number(stats.card_counts[state])}
                  </span>
                </div>
              </div>
            ))}
          </ListSection>

          <ListSection
            header={t("stability")}
            footer={`${t("averageRetrievability")}: ${percent(stats.average_retrievability)}`}
          >
            <div className="px-4 pt-2 pb-3">
              <BarChart
                title={t("stability")}
                data={stats.stability.map((b) => ({
                  key: b.label,
                  label: `${b.label} d`,
                  value: b.count,
                }))}
              />
            </div>
          </ListSection>

          <ListSection
            header={t("difficulty")}
            footer={`${t("totalReviews")}: ${format.number(stats.total_reviews)}`}
          >
            <div className="px-4 pt-2 pb-3">
              <BarChart
                title={t("difficulty")}
                data={stats.difficulty.map((b) => ({
                  key: b.label,
                  label: b.label,
                  value: b.count,
                }))}
              />
            </div>
          </ListSection>
        </>
      )}
    </NavigationPage>
  );
}
