"""Offline-first synchronisation (see ADR 0004).

A client sync consists of:

1. ``POST /sync/reviews`` — flush the outbox; the response carries authoritative card states.
2. ``GET /sync/meta`` — decks, presets and note types (small, always complete).
3. ``GET /sync/cards?since=…`` — cards (with note content) changed since the last sync, paged.
4. ``GET /sync/card-ids`` — every existing card id, to prune cards deleted on the server.
5. ``GET /sync/media`` — the media manifest, so the service worker can pre-cache files.

The ``server_time`` of step 2 becomes ``since`` for the next sync.
"""

from __future__ import annotations

from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Query
from pydantic import AwareDatetime
from sqlmodel import col, func, or_, select

from kuru.api.deps import CurrentUser, SessionDep
from kuru.api.serializers import note_type_out, preset_out, study_cards
from kuru.core.time import utcnow
from kuru.models import Card, Deck, DeckConfig, MediaFile, Note, NoteType, ReviewLog
from kuru.schemas.scheduling import CardMemory
from kuru.schemas.sync import (
    CardIds,
    CardPage,
    MediaEntryOut,
    RecentReview,
    ReviewBatch,
    ReviewBatchResult,
    SyncDeck,
    SyncMeta,
)
from kuru.services.presets import default_preset
from kuru.services.queue import is_new_card_review
from kuru.services.reviews import ReviewSubmission, record_reviews

router = APIRouter(prefix="/sync", tags=["sync"])


@router.post("/reviews")
def push_reviews(body: ReviewBatch, session: SessionDep, user: CurrentUser) -> ReviewBatchResult:
    """Upload queued reviews. Idempotent: re-sending a review id is a no-op."""
    result = record_reviews(
        session,
        user,
        (
            ReviewSubmission(
                id=r.id,
                card_id=r.card_id,
                rating=r.rating,
                reviewed_at=r.reviewed_at,
                duration_ms=r.duration_ms,
            )
            for r in body.reviews
        ),
    )
    # Duplicates still return the current state so a client can recover after a lost response.
    duplicate_card_ids = {r.card_id for r in body.reviews if r.id in set(result.duplicates)}
    cards = {card.id: card for card in result.cards}
    if duplicate_card_ids - set(cards):
        for card in session.exec(
            select(Card).where(
                Card.user_id == user.id, col(Card.id).in_(duplicate_card_ids - set(cards))
            )
        ):
            cards[card.id] = card
    return ReviewBatchResult(
        accepted=result.accepted,
        duplicates=result.duplicates,
        rejected=result.rejected,
        cards=[CardMemory.from_card(card) for card in cards.values()],
        server_time=utcnow(),
    )


@router.get("/meta")
def meta(session: SessionDep, user: CurrentUser) -> SyncMeta:
    """Collection metadata. Record ``server_time`` *before* fetching cards."""
    server_time = utcnow()
    default = default_preset(session, user)
    session.commit()
    decks = session.exec(select(Deck).where(Deck.user_id == user.id).order_by(col(Deck.name)))
    presets = session.exec(select(DeckConfig).where(DeckConfig.user_id == user.id))
    note_types = session.exec(select(NoteType).where(NoteType.user_id == user.id))
    card_count = session.exec(
        select(func.count()).select_from(Card).where(Card.user_id == user.id)
    ).one()
    return SyncMeta(
        server_time=server_time,
        timezone=user.timezone,
        day_rollover_hour=user.day_rollover_hour,
        decks=[
            SyncDeck(
                id=d.id,
                name=d.name,
                description=d.description,
                config_id=d.config_id,
                updated_at=d.updated_at,
            )
            for d in decks
            if d.id is not None
        ],
        presets=[preset_out(session, p, default.id) for p in presets],
        note_types=[note_type_out(nt) for nt in note_types],
        card_count=card_count,
    )


@router.get("/cards")
def pull_cards(
    session: SessionDep,
    user: CurrentUser,
    since: AwareDatetime | None = None,
    after_id: int = 0,
    limit: Annotated[int, Query(ge=1, le=5000)] = 1000,
) -> CardPage:
    """Cards whose scheduling or note content changed after ``since`` (all when omitted)."""
    query = (
        select(Card)
        .join(Note, col(Note.id) == Card.note_id)
        .where(Card.user_id == user.id, col(Card.id) > after_id)
    )
    if since is not None:
        query = query.where(or_(col(Card.updated_at) > since, col(Note.updated_at) > since))
    cards = list(session.exec(query.order_by(col(Card.id)).limit(limit)))
    return CardPage(
        cards=study_cards(session, cards),
        next_after_id=cards[-1].id if len(cards) == limit else None,
    )


@router.get("/card-ids")
def card_ids(session: SessionDep, user: CurrentUser) -> CardIds:
    """Ids of all cards, so clients can drop cards deleted on the server."""
    return CardIds(
        card_ids=list(
            session.exec(select(Card.id).where(Card.user_id == user.id).order_by(col(Card.id)))
        )
    )


@router.get("/media")
def media_manifest(
    session: SessionDep, user: CurrentUser, since: datetime | None = None
) -> list[MediaEntryOut]:
    """All media files (optionally only those changed after ``since``)."""
    query = select(MediaFile).where(MediaFile.user_id == user.id)
    if since is not None:
        query = query.where(col(MediaFile.updated_at) > since)
    return [MediaEntryOut.model_validate(m, from_attributes=True) for m in session.exec(query)]


@router.get("/reviews")
def recent_reviews(
    session: SessionDep,
    user: CurrentUser,
    since: AwareDatetime,
    limit: Annotated[int, Query(ge=1, le=20000)] = 5000,
) -> list[RecentReview]:
    """Rated reviews after ``since`` (clients request the current and previous study day)."""
    logs = session.exec(
        select(ReviewLog)
        .where(
            ReviewLog.user_id == user.id,
            col(ReviewLog.reviewed_at) > since,
            col(ReviewLog.rating) > 0,
        )
        .order_by(col(ReviewLog.reviewed_at))
        .limit(limit)
    )
    return [
        RecentReview(
            id=log.id,
            card_id=log.card_id,
            rating=log.rating,
            reviewed_at=log.reviewed_at,
            kind=int(log.kind),
            was_new=is_new_card_review(log),
            duration_ms=log.duration_ms,
        )
        for log in logs
    ]
