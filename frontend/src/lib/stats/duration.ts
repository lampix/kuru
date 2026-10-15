/** Express stability buckets (in days) in the largest calendar unit that fits them exactly. */

export type DurationUnit = "day" | "week" | "month" | "year";

/** The value and unit a number of days reads best in: 14 → 2 weeks, 90 → 3 months. */
export function durationParts(days: number): [number, DurationUnit] {
  if (days >= 365 && days % 365 === 0) return [days / 365, "year"];
  if (days >= 30 && days % 30 === 0) return [days / 30, "month"];
  if (days >= 7 && days % 7 === 0) return [days / 7, "week"];
  return [days, "day"];
}

/** Parse a bucket label from the API: "7-14" or the open-ended "730+". */
export function parseBucket(label: string): { low: number; high: number | null } {
  if (label.endsWith("+")) return { low: Number(label.slice(0, -1)), high: null };
  const [low, high] = label.split("-").map(Number);
  return { low: low ?? 0, high: high ?? null };
}

/** Short axis label: the bucket's upper bound ("2 W"), or "> 2 J" for the open-ended bucket. */
export function bucketAxisLabel(label: string, locale: string): string {
  const { low, high } = parseBucket(label);
  const [value, unit] = durationParts(high ?? low);
  const text = new Intl.NumberFormat(locale, { style: "unit", unit, unitDisplay: "narrow" }).format(
    value,
  );
  return high === null ? `> ${text}` : text;
}

/** Full range for tooltips: "1–2 Wochen", "14–30 Tage", "< 1 Tag", "≥ 2 Jahre". */
export function bucketRangeLabel(label: string, locale: string): string {
  const { low, high } = parseBucket(label);
  const long = (unit: DurationUnit) =>
    new Intl.NumberFormat(locale, { style: "unit", unit, unitDisplay: "long" });
  if (high === null) {
    const [value, unit] = durationParts(low);
    return `≥ ${long(unit).format(value)}`;
  }
  const [lowValue, lowUnit] = durationParts(low);
  const [highValue, highUnit] = durationParts(high);
  if (low === 0) return `< ${long(highUnit).format(highValue)}`;
  if (lowUnit === highUnit) return long(highUnit).formatRange(lowValue, highValue);
  return long("day").formatRange(low, high);
}
