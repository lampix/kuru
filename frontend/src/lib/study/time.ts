/**
 * Study-day boundaries in the user's timezone (port of `backend/src/kuru/core/time.py`).
 * A day starts at `rolloverHour` local time, like in Anki.
 */

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

function zonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

/** Offset (ms) of `timeZone` from UTC at `date`. */
export function timezoneOffset(date: Date, timeZone: string): number {
  const p = zonedParts(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** UTC instant of a wall-clock time in `timeZone`. */
export function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  timeZone: string,
): Date {
  const guess = Date.UTC(year, month - 1, day, hour);
  const first = guess - timezoneOffset(new Date(guess), timeZone);
  // Re-evaluate once to handle DST transitions between guess and result.
  return new Date(guess - timezoneOffset(new Date(first), timeZone));
}

export interface StudyDay {
  start: Date;
  end: Date;
  /** Stable identifier of the day, e.g. 20260601. */
  key: number;
}

export function studyDay(now: Date, timeZone: string, rolloverHour: number): StudyDay {
  const shifted = new Date(now.getTime() - rolloverHour * HOUR);
  const p = zonedParts(shifted, timeZone);
  const start = zonedTimeToUtc(p.year, p.month, p.day, rolloverHour, timeZone);
  const next = new Date(Date.UTC(p.year, p.month - 1, p.day) + DAY);
  const end = zonedTimeToUtc(
    next.getUTCFullYear(),
    next.getUTCMonth() + 1,
    next.getUTCDate(),
    rolloverHour,
    timeZone,
  );
  return { start, end, key: p.year * 10000 + p.month * 100 + p.day };
}
