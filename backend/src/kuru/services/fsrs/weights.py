"""FSRS parameter (weight) handling, including migration from older FSRS versions."""

from __future__ import annotations

from collections.abc import Sequence

from fsrs.scheduler import (
    DEFAULT_PARAMETERS,
    LOWER_BOUNDS_PARAMETERS,
    UPPER_BOUNDS_PARAMETERS,
)

#: Number of parameters in FSRS-6.
FSRS6_PARAM_COUNT = len(DEFAULT_PARAMETERS)

DEFAULT_WEIGHTS: tuple[float, ...] = tuple(DEFAULT_PARAMETERS)

# FSRS-6 generalises two constants of earlier versions into learnable parameters:
#   w19 — short-term stability exponent (FSRS-5 behaviour: 0.0)
#   w20 — forgetting-curve decay        (FSRS-4.5/5 behaviour: 0.5)
# Appending these values reproduces the older model exactly (see ADR 0001).
_FSRS5_TAIL = (0.0, 0.5)
# FSRS-4.5 additionally lacks the short-term parameters w17/w18; zero disables them.
_FSRS45_TAIL = (0.0, 0.0, *_FSRS5_TAIL)


def normalize_weights(weights: Sequence[float] | None) -> tuple[float, ...]:
    """Return a valid FSRS-6 parameter vector.

    * ``None`` / empty → defaults
    * 17 values (FSRS-4.5) or 19 values (FSRS-5) → extended to an equivalent FSRS-6 vector
    * 21 values → used as is

    Values are clamped into the bounds accepted by the scheduler. Any other length falls back to
    the defaults.
    """
    if not weights:
        return DEFAULT_WEIGHTS
    values = [float(w) for w in weights]
    if len(values) == 17:
        values.extend(_FSRS45_TAIL)
    elif len(values) == 19:
        values.extend(_FSRS5_TAIL)
    elif len(values) != FSRS6_PARAM_COUNT:
        return DEFAULT_WEIGHTS
    return tuple(
        min(max(value, low), high)
        for value, low, high in zip(
            values, LOWER_BOUNDS_PARAMETERS, UPPER_BOUNDS_PARAMETERS, strict=True
        )
    )
