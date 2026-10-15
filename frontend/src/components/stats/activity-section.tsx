"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { BarChart } from "@/components/charts/bar-chart";
import { ListSection, SegmentedControl } from "@/components/ios";
import { api } from "@/lib/api/client";
import type { Activity, DayActivity } from "@/lib/api/types";
import { heatColor, monthRange, weekColumns, yearRange } from "@/lib/stats/calendar";
import { cn } from "@/lib/utils";

type View = "year" | "month" | "recent";

const LEGEND = [0, 0.25, 0.5, 0.75, 1];

/** "Reviews per Day" with a year heat map (default), a calendar month and the last 30 days. */
export function ActivitySection({
  deckId,
  refreshKey,
  today,
  recent,
}: {
  deckId: number | null;
  /** Changes whenever the statistics should be refetched (deck filter, sync). */
  refreshKey: string;
  /** Today's study day (ISO). */
  today: string;
  recent: DayActivity[];
}) {
  const t = useTranslations("stats");
  const format = useFormatter();
  const [view, setView] = useState<View>("year");
  const [year, setYear] = useState(() => Number(today.slice(0, 4)));
  const [month, setMonth] = useState(() => ({
    year: Number(today.slice(0, 4)),
    month: Number(today.slice(5, 7)),
  }));
  const [result, setResult] = useState<{ key: string; activity: Activity } | null>(null);
  const [firstDay, setFirstDay] = useState<string | null>(null);

  const range =
    view === "year"
      ? yearRange(year)
      : view === "month"
        ? monthRange(month.year, month.month)
        : { start: recent[0]?.day ?? today, end: today };
  const key = `${refreshKey}:${view}:${range.start}`;

  useEffect(() => {
    if (view === "recent") return;
    let cancelled = false;
    api.statsActivity(range.start, range.end, deckId).then(
      (activity) => {
        if (cancelled) return;
        setResult({ key, activity });
        setFirstDay(activity.first_day);
      },
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, [view, range.start, range.end, deckId, key]);

  const days = view === "recent" ? recent : result?.key === key ? result.activity.days : undefined;
  const canGoBack = firstDay !== null && firstDay < range.start;
  const canGoForward = range.end < today;
  const step = (delta: number) => {
    if (view === "year") setYear((y) => y + delta);
    else
      setMonth(({ year: y, month: m }) => {
        const index = y * 12 + (m - 1) + delta;
        return { year: Math.floor(index / 12), month: (index % 12) + 1 };
      });
  };

  const dayLabel = (iso: string, withYear = false) =>
    format.dateTime(new Date(`${iso}T12:00:00`), {
      month: "short",
      day: "numeric",
      ...(withYear ? { year: "numeric" } : {}),
    });
  const minutes = (ms: number) => format.number(ms / 60000, { maximumFractionDigits: 0 });
  const detail = (a: DayActivity, withYear = false) =>
    `${dayLabel(a.day, withYear)}: ${format.number(a.reviews)} · ${minutes(a.duration_ms)} min`;
  const title =
    view === "year"
      ? String(year)
      : format.dateTime(new Date(Date.UTC(month.year, month.month - 1, 15)), {
          month: "long",
          year: "numeric",
          timeZone: "UTC",
        });
  const summary = days
    ? t("periodSummary", {
        reviews: days.reduce((sum, a) => sum + a.reviews, 0),
        days: days.filter((a) => a.reviews > 0).length,
      })
    : "…";

  return (
    <ListSection
      header={t("reviewsPerDay")}
      footer={view === "recent" ? `${t("last30Days")} · ${summary}` : summary}
    >
      <div className="px-4 pt-3 pb-3">
        <SegmentedControl<View>
          ariaLabel={t("period")}
          value={view}
          onChange={setView}
          options={[
            { value: "year", label: t("viewYear") },
            { value: "month", label: t("viewMonth") },
            { value: "recent", label: t("viewRecent") },
          ]}
        />
        {view !== "recent" ? (
          <div className="mt-2 flex items-center justify-between">
            <StepButton
              label={t("previous")}
              disabled={!canGoBack}
              onClick={() => step(-1)}
              icon={ChevronLeft}
            />
            <span className="text-headline font-semibold tabular-nums" aria-live="polite">
              {title}
            </span>
            <StepButton
              label={t("next")}
              disabled={!canGoForward}
              onClick={() => step(1)}
              icon={ChevronRight}
            />
          </div>
        ) : null}
        {!days ? (
          <p className="py-16 text-center text-label-2" role="status">
            …
          </p>
        ) : view === "year" ? (
          <YearHeatMap
            days={days}
            year={year}
            today={today}
            describe={(a) => detail(a, true)}
            title={`${t("reviewsPerDay")} ${year}`}
          />
        ) : (
          <BarChart
            title={t("reviewsPerDay")}
            highlightKey={today}
            data={days.map((a) => ({
              key: a.day,
              label: dayLabel(a.day),
              value: a.reviews,
              tooltip: detail(a),
            }))}
          />
        )}
      </div>
    </ListSection>
  );
}

function StepButton({
  label,
  disabled,
  onClick,
  icon: Icon,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  icon: typeof ChevronLeft;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex size-11 items-center justify-center text-tint disabled:text-label-4"
    >
      <Icon className="size-6" strokeWidth={2.2} aria-hidden />
    </button>
  );
}

/** GitHub-style contribution grid: one column per week, one square per day. */
function YearHeatMap({
  days,
  year,
  today,
  describe,
  title,
}: {
  days: DayActivity[];
  year: number;
  today: string;
  describe: (activity: DayActivity) => string;
  title: string;
}) {
  const t = useTranslations("stats");
  const format = useFormatter();
  const locale = useLocale();
  const scroller = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<string | null>(null);
  const { start, end } = yearRange(year);
  const columns = weekColumns(start, end, locale === "de" ? 1 : 7);
  const byDay = new Map(days.map((a) => [a.day, a]));
  const max = Math.max(1, ...days.map((a) => a.reviews));
  const activeDay = active ? byDay.get(active) : undefined;

  // Month labels sit above the first week column that contains the 1st of the month.
  const months = columns.flatMap((column, index) => {
    const first = column.find((d) => d?.endsWith("-01"));
    return first ? [{ index, date: new Date(`${first}T12:00:00`) }] : [];
  });

  // On narrow screens the grid scrolls sideways; start at the current week.
  useLayoutEffect(() => {
    const el = scroller.current;
    const cell = el?.querySelector<HTMLElement>("[data-today]");
    if (el && cell) el.scrollLeft = cell.offsetLeft - el.clientWidth / 2;
  }, [year]);

  return (
    <figure className="mt-1">
      <div ref={scroller} className="-mx-1 overflow-x-auto px-1 pt-1 pb-1">
        <div
          role="img"
          aria-label={title}
          className="grid min-w-[560px] gap-[3px]"
          style={{
            gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))`,
            gridTemplateRows: "auto repeat(7, auto)",
            gridAutoFlow: "column",
          }}
          onPointerLeave={() => setActive(null)}
        >
          {columns.map((column, index) => {
            const label = months.find((m) => m.index === index);
            return [
              <span
                key={`m${index}`}
                className="h-4 overflow-visible text-[10px] leading-4 whitespace-nowrap text-label-2"
              >
                {label ? format.dateTime(label.date, { month: "short" }) : null}
              </span>,
              ...column.map((day, row) => {
                if (!day) return <span key={`${index}-${row}`} />;
                const activity = byDay.get(day);
                const reviews = activity?.reviews ?? 0;
                const future = day > today;
                return (
                  <span
                    key={day}
                    data-today={day === today ? "" : undefined}
                    className={cn(
                      "aspect-square rounded-[2px]",
                      future && "opacity-40",
                      day === active && "ring-1 ring-label-2",
                    )}
                    style={{
                      backgroundColor: heatColor(reviews / max),
                      boxShadow:
                        reviews === 0 ? "inset 0 0 0 0.5px var(--ios-separator)" : undefined,
                      outline: day === today ? "1px solid var(--ios-label-3)" : undefined,
                      outlineOffset: day === today ? "1px" : undefined,
                    }}
                    onPointerEnter={() => setActive(day)}
                    onPointerDown={() => setActive(day)}
                  />
                );
              }),
            ];
          })}
        </div>
      </div>
      <figcaption className="mt-2 flex items-center justify-between gap-3 text-footnote text-label-2">
        <span className="truncate tabular-nums">{activeDay ? describe(activeDay) : " "}</span>
        <span className="flex shrink-0 items-center gap-1 text-caption-2">
          {t("less")}
          {LEGEND.map((level) => (
            <span
              key={level}
              className="size-2.5 rounded-[2px]"
              style={{
                backgroundColor: heatColor(level),
                boxShadow: level === 0 ? "inset 0 0 0 0.5px var(--ios-separator)" : undefined,
              }}
              aria-hidden
            />
          ))}
          {t("more")}
        </span>
      </figcaption>
      <table className="sr-only">
        <caption>{title}</caption>
        <tbody>
          {days
            .filter((a) => a.reviews > 0)
            .map((a) => (
              <tr key={a.day}>
                <td>{describe(a)}</td>
              </tr>
            ))}
        </tbody>
      </table>
    </figure>
  );
}
