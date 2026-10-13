/** FSRS parameter handling — mirrors `backend/src/kuru/services/fsrs/weights.py`. */

import { default_w } from "ts-fsrs";

export const FSRS6_PARAM_COUNT = 21;
export const DEFAULT_WEIGHTS: readonly number[] = default_w;

const S_MIN = 0.001;
const INIT_S_MAX = 100;
// Parameter bounds of py-fsrs (the server is authoritative, so the client uses the same ones).
const LOWER = [
  S_MIN,
  S_MIN,
  S_MIN,
  S_MIN,
  1,
  0.001,
  0.001,
  0.001,
  0,
  0,
  0.001,
  0.001,
  0.001,
  0.001,
  0,
  0,
  1,
  0,
  0,
  0,
  0.1,
];
const UPPER = [
  INIT_S_MAX,
  INIT_S_MAX,
  INIT_S_MAX,
  INIT_S_MAX,
  10,
  4,
  4,
  0.75,
  4.5,
  0.8,
  3.5,
  5,
  0.25,
  0.9,
  4,
  1,
  6,
  2,
  2,
  0.8,
  0.8,
];

/** Return a valid FSRS-6 vector; FSRS-4.5 (17) and FSRS-5 (19) vectors are extended equivalently. */
export function normalizeWeights(weights: readonly number[] | null | undefined): number[] {
  if (!weights || weights.length === 0) return [...DEFAULT_WEIGHTS];
  const values = [...weights];
  if (values.length === 17) values.push(0, 0, 0, 0.5);
  else if (values.length === 19) values.push(0, 0.5);
  else if (values.length !== FSRS6_PARAM_COUNT) return [...DEFAULT_WEIGHTS];
  return values.map((value, i) => Math.min(Math.max(value, LOWER[i]!), UPPER[i]!));
}
