"use client";

import { useId, useState } from "react";

import { cn } from "@/lib/utils";

export interface BarDatum {
  key: string;
  /** Short axis label (only first/last are drawn). */
  label: string;
  value: number;
  /** Tooltip text; defaults to "label: value". */
  tooltip?: string;
}

const HEIGHT = 132;
const TOP = 14;
const BOTTOM = 18;
const MAX_BAR = 24;
const GAP = 2;
const RADIUS = 4;

/** Path for a column with a rounded data-end and a square baseline. */
function columnPath(x: number, y: number, width: number, height: number): string {
  const r = Math.min(RADIUS, width / 2, height);
  const base = y + height;
  return `M${x},${base}V${y + r}Q${x},${y} ${x + r},${y}H${x + width - r}Q${x + width},${y} ${x + width},${y + r}V${base}Z`;
}

/** Single-series column chart (no legend: the section title names the series). */
export function BarChart({
  data,
  title,
  formatValue = (v) => String(v),
  className,
}: {
  data: readonly BarDatum[];
  title: string;
  formatValue?: (value: number) => string;
  className?: string;
}) {
  const id = useId();
  const [active, setActive] = useState<number | null>(null);
  const width = 340;
  const max = Math.max(1, ...data.map((d) => d.value));
  const band = width / Math.max(1, data.length);
  const barWidth = Math.max(1, Math.min(MAX_BAR, band - GAP));
  const plot = HEIGHT - TOP - BOTTOM;
  const activeDatum = active !== null ? data[active] : undefined;

  const onMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * width;
    setActive(Math.min(data.length - 1, Math.max(0, Math.floor(x / band))));
  };

  return (
    <figure className={cn("relative", className)}>
      <svg
        viewBox={`0 0 ${width} ${HEIGHT}`}
        className="w-full touch-none overflow-visible select-none"
        role="img"
        aria-labelledby={`${id}-title`}
        onPointerMove={onMove}
        onPointerDown={onMove}
        onPointerLeave={() => setActive(null)}
      >
        <title id={`${id}-title`}>{title}</title>
        {[0, 0.5, 1].map((f) => (
          <line
            key={f}
            x1={0}
            x2={width}
            y1={TOP + plot * (1 - f)}
            y2={TOP + plot * (1 - f)}
            stroke="var(--ios-separator)"
            strokeWidth={f === 0 ? 1 : 0.5}
            vectorEffect="non-scaling-stroke"
          />
        ))}
        <text x={width} y={TOP - 4} textAnchor="end" className="fill-label-2 text-[10px]">
          {formatValue(max)}
        </text>
        {data.map((d, i) => {
          const h = (d.value / max) * plot;
          const x = i * band + (band - barWidth) / 2;
          return (
            <g key={d.key}>
              <rect x={i * band} y={TOP} width={band} height={plot} fill="transparent" />
              {d.value > 0 ? (
                <path
                  d={columnPath(x, TOP + plot - h, barWidth, h)}
                  fill="var(--ios-blue)"
                  opacity={active === null || active === i ? 1 : 0.45}
                />
              ) : null}
            </g>
          );
        })}
        {data.length ? (
          <>
            <text x={0} y={HEIGHT - 4} className="fill-label-2 text-[10px]">
              {data[0]!.label}
            </text>
            <text x={width} y={HEIGHT - 4} textAnchor="end" className="fill-label-2 text-[10px]">
              {data[data.length - 1]!.label}
            </text>
          </>
        ) : null}
      </svg>
      {activeDatum ? (
        <div
          className="pointer-events-none absolute -top-2 rounded-lg bg-grouped-3 px-2 py-1 text-footnote whitespace-nowrap shadow-md"
          style={{
            left: `${((active! + 0.5) / data.length) * 100}%`,
            transform: `translateX(${active! < data.length / 2 ? "-20%" : "-80%"}) translateY(-100%)`,
          }}
        >
          {activeDatum.tooltip ?? `${activeDatum.label}: ${formatValue(activeDatum.value)}`}
        </div>
      ) : null}
      <table className="sr-only">
        <caption>{title}</caption>
        <tbody>
          {data.map((d) => (
            <tr key={d.key}>
              <th scope="row">{d.label}</th>
              <td>{formatValue(d.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

/** A headline number. */
export function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-[10px] bg-grouped-2 p-3">
      <span className="text-footnote text-label-2">{label}</span>
      <span className="text-title-2 font-bold tabular-nums">{value}</span>
      {hint ? <span className="text-caption-2 text-label-3">{hint}</span> : null}
    </div>
  );
}
