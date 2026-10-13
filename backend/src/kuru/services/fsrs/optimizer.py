"""FSRS parameter optimisation (weight auto-tuning) from the review log.

Requires the optional ``optimizer`` extra (``uv sync --extra optimizer``), which installs PyTorch.
"""

from __future__ import annotations

from collections.abc import Iterable
from datetime import datetime
from importlib.util import find_spec

import fsrs

from kuru.services.fsrs.weights import normalize_weights

#: Below this many reviews the optimizer's output is not meaningful.
MIN_REVIEWS_FOR_OPTIMIZATION = 400


class OptimizerUnavailableError(RuntimeError):
    """Raised when PyTorch / the optimizer extra is not installed."""


class NotEnoughReviewsError(ValueError):
    """Raised when there is too little history to optimize."""


def optimizer_available() -> bool:
    """Whether the optional optimizer dependencies are installed."""
    return find_spec("torch") is not None


def optimize_weights(
    reviews: Iterable[tuple[int, int, datetime]],
) -> tuple[float, ...]:
    """Compute optimal FSRS-6 weights.

    ``reviews`` yields ``(card_id, rating, reviewed_at)`` tuples for rated reviews.
    """
    if not optimizer_available():
        raise OptimizerUnavailableError("Install the optimizer extra: uv sync --extra optimizer")
    logs = [
        fsrs.ReviewLog(
            card_id=card_id, rating=fsrs.Rating(rating), review_datetime=at, review_duration=None
        )
        for card_id, rating, at in reviews
        if 1 <= rating <= 4
    ]
    if len(logs) < MIN_REVIEWS_FOR_OPTIMIZATION:
        raise NotEnoughReviewsError(
            f"At least {MIN_REVIEWS_FOR_OPTIMIZATION} reviews are required, found {len(logs)}."
        )
    optimizer = fsrs.Optimizer(logs)
    return normalize_weights(optimizer.compute_optimal_parameters())
