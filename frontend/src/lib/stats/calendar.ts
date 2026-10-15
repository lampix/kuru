/** Date helpers for the activity calendars. Days are ISO `YYYY-MM-DD` strings (study days). */

const DAY_MS = 86_400_000;

function toDate(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

function toIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  return toIso(new Date(toDate(iso).getTime() + days * DAY_MS));
}

/** First and last day of a calendar year. */
export function yearRange(year: number): { start: string; end: string } {
  return { start: `${year}-01-01`, end: `${year}-12-31` };
}

/** First and last day of a calendar month (`month` is 1-based). */
export function monthRange(year: number, month: number): { start: string; end: string } {
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const mm = String(month).padStart(2, "0");
  return { start: `${year}-${mm}-01`, end: `${year}-${mm}-${String(last).padStart(2, "0")}` };
}

/** Every day from `start` to `end`, inclusive. */
export function daysBetween(start: string, end: string): string[] {
  const days: string[] = [];
  for (let day = start; day <= end; day = addDays(day, 1)) days.push(day);
  return days;
}

/** ISO weekday with Monday = 1 … Sunday = 7. */
export function weekday(iso: string): number {
  return toDate(iso).getUTCDay() || 7;
}

/**
 * Lay the days of a range out in week columns, GitHub-contribution style: each column holds seven
 * cells starting at `firstDay` (1 = Monday … 7 = Sunday); cells outside the range are `null`.
 */
export function weekColumns(start: string, end: string, firstDay = 1): Array<Array<string | null>> {
  const columns: Array<Array<string | null>> = [];
  const lead = (weekday(start) - firstDay + 7) % 7;
  let column: Array<string | null> = Array.from({ length: lead }, () => null);
  for (const day of daysBetween(start, end)) {
    column.push(day);
    if (column.length === 7) {
      columns.push(column);
      column = [];
    }
  }
  if (column.length)
    columns.push([...column, ...Array.from({ length: 7 - column.length }, () => null)]);
  return columns;
}

/**
 * Heat-map fill for an intensity in [0, 1]: from the empty colour through the tint (at 0.5) to a
 * tint mixed towards the peak colour. Any non-zero value is at least faintly coloured so single reviews stay visible.
 */
export function heatColor(intensity: number): string {
  if (intensity <= 0) return "var(--heat-empty)";
  const t = Math.min(1, Math.max(0.08, intensity));
  if (t <= 0.5) {
    return `color-mix(in srgb, var(--ios-blue) ${Math.round(t * 200)}%, var(--heat-empty))`;
  }
  return `color-mix(in srgb, var(--ios-blue) ${Math.round(100 - (t - 0.5) * 100)}%, var(--heat-peak))`;
}
