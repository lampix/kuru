/** Compact interval labels for answer buttons, e.g. "<1m", "10m", "2d", "8.4mo", "1.8y". */
export function formatInterval(seconds: number, locale = "en"): string {
  const number = (value: number, digits = 0) =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(value);
  const minute = 60;
  const hour = 60 * minute;
  const day = 24 * hour;
  const month = 30 * day;
  const year = 365 * day;
  if (seconds < minute) return "<1m";
  if (seconds < hour) return `${number(Math.round(seconds / minute))}m`;
  if (seconds < day) return `${number(seconds / hour, 1)}h`;
  if (seconds < month) return `${number(Math.round(seconds / day))}d`;
  if (seconds < year) return `${number(seconds / month, 1)}mo`;
  return `${number(seconds / year, 1)}y`;
}
