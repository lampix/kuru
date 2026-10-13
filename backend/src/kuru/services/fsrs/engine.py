"""FSRS-6 scheduling engine wrapping the official ``fsrs`` package.

The engine works on :class:`MemoryState`, a plain value object, so it can be used for live answers,
interval previews and full review-log replays without touching the database.
"""

from __future__ import annotations

from collections.abc import Iterable, Sequence
from dataclasses import dataclass, replace
from datetime import UTC, datetime, timedelta
from typing import Any

import fsrs

from kuru.models import Card, CardState, DeckConfig, ReviewKind
from kuru.services.fsrs.fuzz import fuzz_interval, fuzz_seed
from kuru.services.fsrs.weights import normalize_weights


@dataclass(frozen=True, slots=True)
class SchedulingOptions:
    """Scheduler configuration derived from a deck preset."""

    weights: tuple[float, ...]
    desired_retention: float = 0.9
    learning_steps: tuple[float, ...] = (1.0, 10.0)  # minutes
    relearning_steps: tuple[float, ...] = (10.0,)  # minutes
    maximum_interval: int = 36500
    enable_fuzz: bool = True

    @classmethod
    def from_config(cls, config: DeckConfig | None) -> SchedulingOptions:
        """Build options from a deck preset (or defaults when ``None``)."""
        if config is None:
            return cls(weights=normalize_weights(None))
        return cls(
            weights=normalize_weights(config.fsrs_weights),
            desired_retention=config.desired_retention,
            learning_steps=tuple(config.learning_steps),
            relearning_steps=tuple(config.relearning_steps),
            maximum_interval=config.maximum_interval,
            enable_fuzz=config.enable_fuzz,
        )


@dataclass(frozen=True, slots=True)
class MemoryState:
    """Scheduling-relevant state of a card."""

    card_id: int
    state: CardState = CardState.NEW
    step: int | None = None
    stability: float | None = None
    difficulty: float | None = None
    due: datetime | None = None
    last_review: datetime | None = None
    reps: int = 0
    lapses: int = 0

    @classmethod
    def from_card(cls, card: Card) -> MemoryState:
        """Snapshot the state of a database card."""
        assert card.id is not None
        return cls(
            card_id=card.id,
            state=CardState(card.state),
            step=card.step,
            stability=card.stability,
            difficulty=card.difficulty,
            due=card.due,
            last_review=card.last_review,
            reps=card.reps,
            lapses=card.lapses,
        )

    def to_dict(self) -> dict[str, Any]:
        """JSON-serialisable representation (stored in ``ReviewLog.memory_before``)."""
        return {
            "state": int(self.state),
            "step": self.step,
            "stability": self.stability,
            "difficulty": self.difficulty,
            "due": self.due.isoformat() if self.due else None,
            "last_review": self.last_review.isoformat() if self.last_review else None,
            "reps": self.reps,
            "lapses": self.lapses,
        }

    @classmethod
    def from_dict(cls, card_id: int, data: dict[str, Any]) -> MemoryState:
        """Inverse of :meth:`to_dict`."""
        return cls(
            card_id=card_id,
            state=CardState(data["state"]),
            step=data.get("step"),
            stability=data.get("stability"),
            difficulty=data.get("difficulty"),
            due=datetime.fromisoformat(data["due"]) if data.get("due") else None,
            last_review=(
                datetime.fromisoformat(data["last_review"]) if data.get("last_review") else None
            ),
            reps=data.get("reps", 0),
            lapses=data.get("lapses", 0),
        )

    def apply_to(self, card: Card) -> None:
        """Write this state onto a database card."""
        card.state = self.state
        card.step = self.step
        card.stability = self.stability
        card.difficulty = self.difficulty
        card.due = self.due
        card.last_review = self.last_review
        card.reps = self.reps
        card.lapses = self.lapses


@dataclass(frozen=True, slots=True)
class ReplayEntry:
    """A review-log entry as needed for replay."""

    rating: int
    reviewed_at: datetime
    kind: ReviewKind = ReviewKind.REVIEW
    interval: int | None = None
    factor: int | None = None


RATINGS: tuple[fsrs.Rating, ...] = (
    fsrs.Rating.Again,
    fsrs.Rating.Hard,
    fsrs.Rating.Good,
    fsrs.Rating.Easy,
)


def _ensure_utc(moment: datetime) -> datetime:
    if moment.tzinfo is None:
        raise ValueError("datetime must be timezone-aware")
    return moment.astimezone(UTC)


class FsrsEngine:
    """Computes card states with FSRS-6."""

    def __init__(self, options: SchedulingOptions) -> None:
        self.options = options
        self._scheduler = fsrs.Scheduler(
            parameters=options.weights,
            desired_retention=options.desired_retention,
            learning_steps=tuple(timedelta(minutes=m) for m in options.learning_steps),
            relearning_steps=tuple(timedelta(minutes=m) for m in options.relearning_steps),
            maximum_interval=options.maximum_interval,
            enable_fuzzing=False,  # replaced by deterministic fuzz, see fuzz.py
        )

    @classmethod
    def for_config(cls, config: DeckConfig | None) -> FsrsEngine:
        """Create an engine for a deck preset."""
        return cls(SchedulingOptions.from_config(config))

    # -- conversions -----------------------------------------------------------------------

    @staticmethod
    def _to_fsrs(memory: MemoryState, now: datetime) -> fsrs.Card:
        if memory.state == CardState.NEW:
            return fsrs.Card(card_id=memory.card_id, state=fsrs.State.Learning, step=0, due=now)
        return fsrs.Card(
            card_id=memory.card_id,
            state=fsrs.State(int(memory.state)),
            step=memory.step,
            stability=memory.stability,
            difficulty=memory.difficulty,
            due=memory.due or now,
            last_review=memory.last_review,
        )

    # -- scheduling ------------------------------------------------------------------------

    def review(self, memory: MemoryState, rating: int, reviewed_at: datetime) -> MemoryState:
        """Return the state after answering ``memory`` with ``rating`` (1-4) at ``reviewed_at``."""
        if rating not in (1, 2, 3, 4):
            raise ValueError(f"rating must be 1-4, got {rating}")
        now = _ensure_utc(reviewed_at)
        # FSRS cannot handle a review that predates the previous one; treat it as simultaneous.
        if memory.last_review is not None and now < memory.last_review:
            now = memory.last_review
        card, _log = self._scheduler.review_card(
            self._to_fsrs(memory, now), fsrs.Rating(rating), review_datetime=now
        )
        due: datetime = card.due
        if self.options.enable_fuzz and card.state == fsrs.State.Review:
            days = (due - now).days
            fuzzed = fuzz_interval(
                days, fuzz_seed(memory.card_id, memory.reps), self.options.maximum_interval
            )
            due = now + timedelta(days=fuzzed)
        lapsed = memory.state == CardState.REVIEW and rating == fsrs.Rating.Again
        return MemoryState(
            card_id=memory.card_id,
            state=CardState(int(card.state)),
            step=card.step,
            stability=card.stability,
            difficulty=card.difficulty,
            due=due,
            last_review=now,
            reps=memory.reps + 1,
            lapses=memory.lapses + (1 if lapsed else 0),
        )

    def preview(self, memory: MemoryState, now: datetime) -> dict[int, MemoryState]:
        """Return the resulting state for each of the four ratings."""
        return {int(rating): self.review(memory, int(rating), now) for rating in RATINGS}

    def retrievability(self, memory: MemoryState, now: datetime) -> float | None:
        """Probability of recall at ``now``, or ``None`` for cards never reviewed."""
        if memory.state == CardState.NEW or memory.stability is None:
            return None
        return float(
            self._scheduler.get_card_retrievability(
                self._to_fsrs(memory, now), current_datetime=_ensure_utc(now)
            )
        )

    def replay(self, card_id: int, entries: Iterable[ReplayEntry]) -> MemoryState:
        """Recompute a card's state from its complete review history.

        Rated entries are reviewed in chronological order. Manual entries (rating 0) with an
        interval of 0 represent *forget* and reset the card; manual/rescheduled entries with a
        positive interval only move the due date. Filtered-deck previews that did not affect
        scheduling (``factor == 0``) are skipped, mirroring Anki.
        """
        memory = MemoryState(card_id=card_id)
        for entry in sorted(entries, key=lambda e: e.reviewed_at):
            at = _ensure_utc(entry.reviewed_at)
            if entry.rating == 0:
                if entry.kind in (ReviewKind.MANUAL, ReviewKind.RESCHEDULED):
                    if not entry.interval:
                        memory = MemoryState(card_id=card_id, reps=memory.reps)
                    elif entry.interval > 0 and memory.state != CardState.NEW:
                        memory = replace(memory, due=at + timedelta(days=entry.interval))
                continue
            if entry.kind == ReviewKind.FILTERED and entry.factor == 0:
                continue
            memory = self.review(memory, entry.rating, at)
        return memory


def interval_label_seconds(memory: MemoryState, now: datetime) -> int:
    """Seconds between ``now`` and the due date (for interval previews)."""
    if memory.due is None:
        return 0
    return max(0, int((memory.due - now).total_seconds()))


def default_weights() -> Sequence[float]:
    """The FSRS-6 default parameters."""
    return normalize_weights(None)
