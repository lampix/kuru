/**
 * Deterministic interval fuzz — a bit-for-bit port of `backend/src/kuru/services/fsrs/fuzz.py`.
 *
 * Both sides must produce identical intervals so the due date shown offline matches the one the
 * server computes when it replays the review. Verified against `shared/test-vectors/fsrs.json`.
 */

const FUZZ_RANGES: ReadonlyArray<readonly [start: number, end: number, factor: number]> = [
  [2.5, 7.0, 0.15],
  [7.0, 20.0, 0.1],
  [20.0, Infinity, 0.05],
];

/** 32-bit FNV-1a hash of the UTF-8 encoding of `text`. */
export function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(text)) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** First output of the mulberry32 PRNG for `seed`, in [0, 1). */
export function mulberry32(seed: number): number {
  let a = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  a = (t ^ (t >>> 14)) >>> 0;
  return a / 4294967296;
}

export function fuzzSeed(cardId: number, reps: number): number {
  return fnv1a(`${cardId}:${reps}`);
}

export function fuzzRange(intervalDays: number, maximumInterval: number): [number, number] {
  let delta = 1.0;
  for (const [start, end, factor] of FUZZ_RANGES) {
    delta += factor * Math.max(Math.min(intervalDays, end) - start, 0);
  }
  const minIvl = Math.max(2, Math.floor(intervalDays - delta + 0.5));
  const maxIvl = Math.min(Math.floor(intervalDays + delta + 0.5), maximumInterval);
  return [Math.min(minIvl, maxIvl), maxIvl];
}

/** Apply deterministic fuzz to an interval in days. Intervals below 3 days are unchanged. */
export function fuzzInterval(intervalDays: number, seed: number, maximumInterval: number): number {
  if (intervalDays < 2.5) return intervalDays;
  const [low, high] = fuzzRange(intervalDays, maximumInterval);
  return Math.min(low + Math.floor(mulberry32(seed) * (high - low + 1)), maximumInterval);
}
