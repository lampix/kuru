"""Endpoints for answering cards and previewing intervals."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from kuru.api.deps import CurrentUser, SessionDep
from kuru.core.time import utcnow
from kuru.models import Card
from kuru.schemas.scheduling import (
    AnswerRequest,
    AnswerResponse,
    CardMemory,
    CardPreview,
    RatingPreview,
)
from kuru.services.fsrs import FsrsEngine, MemoryState
from kuru.services.presets import preset_for_card
from kuru.services.reviews import ReviewSubmission, preview_card, record_reviews, undo_review

router = APIRouter(tags=["scheduling"])


def _owned_card(session: SessionDep, user: CurrentUser, card_id: int) -> Card:
    card = session.get(Card, card_id)
    if card is None or card.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Card not found")
    return card


@router.get("/cards/{card_id}/memory")
def get_memory(card_id: int, session: SessionDep, user: CurrentUser) -> CardMemory:
    """Return the current FSRS memory state of a card."""
    return CardMemory.from_card(_owned_card(session, user, card_id))


@router.get("/cards/{card_id}/preview")
def preview(card_id: int, session: SessionDep, user: CurrentUser) -> CardPreview:
    """Preview the next due date for each rating."""
    card = _owned_card(session, user, card_id)
    now = utcnow()
    outcomes = preview_card(session, user, card, now)
    engine = FsrsEngine.for_config(preset_for_card(session, user, card))
    return CardPreview(
        card_id=card_id,
        retrievability=engine.retrievability(MemoryState.from_card(card), now),
        again=RatingPreview.from_memory(outcomes[1], now),
        hard=RatingPreview.from_memory(outcomes[2], now),
        good=RatingPreview.from_memory(outcomes[3], now),
        easy=RatingPreview.from_memory(outcomes[4], now),
    )


@router.post("/cards/{card_id}/answer")
def answer(
    card_id: int, body: AnswerRequest, session: SessionDep, user: CurrentUser
) -> AnswerResponse:
    """Answer a card online. Offline clients use ``POST /api/sync/reviews`` instead."""
    _owned_card(session, user, card_id)
    result = record_reviews(
        session,
        user,
        [
            ReviewSubmission(
                id=body.id,
                card_id=card_id,
                rating=body.rating,
                reviewed_at=body.reviewed_at or utcnow(),
                duration_ms=body.duration_ms,
            )
        ],
    )
    if body.id in result.rejected:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, result.rejected[body.id])
    card = session.get(Card, card_id)
    assert card is not None
    return AnswerResponse(
        review_id=body.id, duplicate=body.id in result.duplicates, card=CardMemory.from_card(card)
    )


@router.delete("/reviews/{review_id}")
def undo(review_id: str, session: SessionDep, user: CurrentUser) -> CardMemory:
    """Undo a review, restoring the card's previous state."""
    card = undo_review(session, user, review_id)
    if card is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Review not found")
    return CardMemory.from_card(card)
