"""Statistics and card history."""

from __future__ import annotations

from datetime import date, datetime

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from sqlmodel import col, select

from kuru.api.deps import CurrentUser, SessionDep
from kuru.core.time import utcnow
from kuru.models import Card, Deck, ReviewLog
from kuru.services.stats import compute_stats

router = APIRouter(tags=["stats"])


class DayActivityOut(BaseModel):
    day: date
    reviews: int
    again: int
    new: int
    duration_ms: int


class BucketOut(BaseModel):
    label: str
    count: int


class ForecastOut(BaseModel):
    day: date
    count: int


class StatsOut(BaseModel):
    today: DayActivityOut
    activity: list[DayActivityOut]
    retention: float | None
    retention_reviews: int
    forecast: list[ForecastOut]
    card_counts: dict[str, int]
    stability: list[BucketOut]
    difficulty: list[BucketOut]
    average_retrievability: float | None
    total_reviews: int
    streak: int


class HistoryEntry(BaseModel):
    id: str
    rating: int
    reviewed_at: datetime
    kind: int
    interval: int | None
    duration_ms: int | None


@router.get("/stats")
def stats(session: SessionDep, user: CurrentUser, deck_id: int | None = None) -> StatsOut:
    """Statistics for the collection, or for a deck including its sub-decks."""
    deck = None
    if deck_id is not None:
        deck = session.get(Deck, deck_id)
        if deck is None or deck.user_id != user.id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Deck not found")
    result = compute_stats(session, user, utcnow(), deck)
    return StatsOut(
        today=DayActivityOut.model_validate(result.today, from_attributes=True),
        activity=[DayActivityOut.model_validate(a, from_attributes=True) for a in result.activity],
        retention=result.retention,
        retention_reviews=result.retention_reviews,
        forecast=[ForecastOut(day=d, count=c) for d, c in result.forecast],
        card_counts=result.card_counts,
        stability=[BucketOut(label=label, count=c) for label, c in result.stability],
        difficulty=[BucketOut(label=label, count=c) for label, c in result.difficulty],
        average_retrievability=result.average_retrievability,
        total_reviews=result.total_reviews,
        streak=result.streak,
    )


@router.get("/cards/{card_id}/history")
def card_history(card_id: int, session: SessionDep, user: CurrentUser) -> list[HistoryEntry]:
    """The review log of a card, newest first."""
    card = session.get(Card, card_id)
    if card is None or card.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Card not found")
    logs = session.exec(
        select(ReviewLog)
        .where(ReviewLog.card_id == card_id)
        .order_by(col(ReviewLog.reviewed_at).desc())
    )
    return [HistoryEntry.model_validate(log, from_attributes=True) for log in logs]
