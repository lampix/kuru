"""Bulk card operations."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from kuru.api.deps import CurrentUser, SessionDep
from kuru.schemas.scheduling import CardMemory
from kuru.services.card_actions import CardAction, apply_action

router = APIRouter(prefix="/cards", tags=["cards"])


class CardActionRequest(BaseModel):
    card_ids: list[int] = Field(min_length=1, max_length=10000)
    action: CardAction
    deck_id: int | None = Field(default=None, description="Target deck for the move action")


@router.post("/actions")
def card_actions(
    body: CardActionRequest, session: SessionDep, user: CurrentUser
) -> list[CardMemory]:
    """Suspend, unsuspend, bury, unbury, forget or move cards."""
    try:
        cards = apply_action(session, user, body.card_ids, body.action, deck_id=body.deck_id)
    except ValueError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(exc)) from exc
    return [CardMemory.from_card(card) for card in cards]
