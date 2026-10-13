"""Bulk card operations: suspend, bury, forget, move."""

from __future__ import annotations

from collections.abc import Sequence
from enum import StrEnum
from uuid import uuid4

from sqlmodel import Session, col, func, select

from kuru.core.time import next_day_start, utcnow
from kuru.models import Card, CardState, Deck, ReviewKind, ReviewLog, User
from kuru.services.fsrs import MemoryState


class CardAction(StrEnum):
    SUSPEND = "suspend"
    UNSUSPEND = "unsuspend"
    BURY = "bury"
    UNBURY = "unbury"
    FORGET = "forget"
    MOVE = "move"


def owned_cards(session: Session, user: User, card_ids: Sequence[int]) -> list[Card]:
    """Load cards by id, silently dropping ids that do not belong to ``user``."""
    if not card_ids:
        return []
    return list(
        session.exec(select(Card).where(Card.user_id == user.id, col(Card.id).in_(card_ids)))
    )


def apply_action(
    session: Session,
    user: User,
    card_ids: Sequence[int],
    action: CardAction,
    *,
    deck_id: int | None = None,
) -> list[Card]:
    """Apply ``action`` to the given cards and commit. Returns the changed cards."""
    assert user.id is not None
    cards = owned_cards(session, user, card_ids)
    now = utcnow()
    if action == CardAction.MOVE:
        deck = session.get(Deck, deck_id) if deck_id is not None else None
        if deck is None or deck.user_id != user.id:
            raise ValueError("Target deck not found")
    next_position = (
        session.exec(select(func.max(Card.position)).where(Card.user_id == user.id)).one() or 0
    ) + 1

    for card in cards:
        match action:
            case CardAction.SUSPEND:
                card.suspended = True
            case CardAction.UNSUSPEND:
                card.suspended = False
            case CardAction.BURY:
                card.buried_until = next_day_start(now, user.timezone, user.day_rollover_hour)
            case CardAction.UNBURY:
                card.buried_until = None
            case CardAction.MOVE:
                assert deck_id is not None
                card.deck_id = deck_id
            case CardAction.FORGET:
                assert card.id is not None
                # Logged like Anki's "forget" (manual entry, interval 0) so replays reset too.
                session.add(
                    ReviewLog(
                        id=str(uuid4()),
                        user_id=user.id,
                        card_id=card.id,
                        rating=0,
                        reviewed_at=now,
                        kind=ReviewKind.MANUAL,
                        interval=0,
                        last_interval=0,
                        memory_before=MemoryState.from_card(card).to_dict(),
                    )
                )
                MemoryState(card_id=card.id).apply_to(card)
                card.state = CardState.NEW
                card.position = next_position
                next_position += 1
        card.updated_at = now
        session.add(card)
    session.commit()
    for card in cards:
        session.refresh(card)
    return cards
