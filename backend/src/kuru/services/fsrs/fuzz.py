"""Deterministic interval fuzzing.

FSRS adds a little random "fuzz" to review intervals so cards learned together do not stay
clumped. The reference implementations use a global RNG, which would make the server's replay
disagree with the interval the client showed. Kuru therefore disables the libraries' fuzzing and
applies this deterministic variant, seeded by card id and review count. The frontend contains a
bit-for-bit identical port (``frontend/src/lib/fsrs/fuzz.ts``), verified by shared test vectors.
"""

from __future__ import annotations

import math

_MASK = 0xFFFFFFFF

# Same ranges as py-fsrs / ts-fsrs.
FUZZ_RANGES: tuple[tuple[float, float, float], ...] = (
    (2.5, 7.0, 0.15),
    (7.0, 20.0, 0.1),
    (20.0, math.inf, 0.05),
)


def _imul(a: int, b: int) -> int:
    return (a * b) & _MASK


def fnv1a(text: str) -> int:
    """32-bit FNV-1a hash of the UTF-8 encoding of ``text``."""
    h = 0x811C9DC5
    for byte in text.encode():
        h ^= byte
        h = _imul(h, 0x01000193)
    return h


def mulberry32(seed: int) -> float:
    """First output of the mulberry32 PRNG for ``seed``, in ``[0, 1)``."""
    a = (seed + 0x6D2B79F5) & _MASK
    t = _imul(a ^ (a >> 15), 1 | a)
    t = ((t + _imul(t ^ (t >> 7), 61 | t)) & _MASK) ^ t
    return ((t ^ (t >> 14)) & _MASK) / 4294967296


def fuzz_seed(card_id: int, reps: int) -> int:
    """Seed for a card's ``reps``-th review."""
    return fnv1a(f"{card_id}:{reps}")


def fuzz_range(interval_days: int, maximum_interval: int) -> tuple[int, int]:
    """Inclusive bounds the fuzzed interval may fall into."""
    delta = 1.0
    for start, end, factor in FUZZ_RANGES:
        delta += factor * max(min(float(interval_days), end) - start, 0.0)
    min_ivl = max(2, math.floor(interval_days - delta + 0.5))
    max_ivl = min(math.floor(interval_days + delta + 0.5), maximum_interval)
    return min(min_ivl, max_ivl), max_ivl


def fuzz_interval(interval_days: int, seed: int, maximum_interval: int) -> int:
    """Apply deterministic fuzz to an interval (in days). Intervals below 3 days are unchanged."""
    if interval_days < 2.5:
        return interval_days
    low, high = fuzz_range(interval_days, maximum_interval)
    return min(low + math.floor(mulberry32(seed) * (high - low + 1)), maximum_interval)
