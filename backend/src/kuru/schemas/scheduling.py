"""Scheduling-related API models."""

from __future__ import annotations

from datetime import datetime
from uuid import uuid4

from pydantic import AwareDatetime, BaseModel, Field

from kuru.models import Card, CardState
from kuru.services.fsrs import MemoryState


class CardMemory(BaseModel):
    """FSRS memory state of a card."""

    card_id: int
    state: CardState
    step: int | None
    stability: float | None
    difficulty: float | None
    due: datetime | None
    last_review: datetime | None
    reps: int
    lapses: int
    suspended: bool = False
    buried_until: datetime | None = None

    @classmethod
    def from_card(cls, card: Card) -> CardMemory:
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
            suspended=card.suspended,
            buried_until=card.buried_until,
        )


class RatingPreview(BaseModel):
    """Outcome of one rating."""

    state: CardState
    due: datetime
    interval_seconds: int

    @classmethod
    def from_memory(cls, memory: MemoryState, now: datetime) -> RatingPreview:
        assert memory.due is not None
        return cls(
            state=memory.state,
            due=memory.due,
            interval_seconds=max(0, int((memory.due - now).total_seconds())),
        )


class CardPreview(BaseModel):
    """Interval previews for all four ratings."""

    card_id: int
    retrievability: float | None
    again: RatingPreview
    hard: RatingPreview
    good: RatingPreview
    easy: RatingPreview


class AnswerRequest(BaseModel):
    """Answer a card."""

    id: str = Field(default_factory=lambda: str(uuid4()), max_length=36)
    rating: int = Field(ge=1, le=4, description="1 = Again, 2 = Hard, 3 = Good, 4 = Easy")
    reviewed_at: AwareDatetime | None = None
    duration_ms: int | None = Field(default=None, ge=0, le=60 * 60 * 1000)


class AnswerResponse(BaseModel):
    review_id: str
    duplicate: bool
    card: CardMemory
