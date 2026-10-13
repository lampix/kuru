"""Deck option presets (Anki "options groups")."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Response, status
from sqlmodel import col, select

from kuru.api.deps import CurrentUser, SessionDep
from kuru.api.serializers import preset_out
from kuru.core.time import utcnow
from kuru.models import Card, Deck, DeckConfig, ReviewLog
from kuru.schemas.presets import OptimizeResult, PresetCreate, PresetOut, PresetUpdate
from kuru.services.fsrs.optimizer import (
    NotEnoughReviewsError,
    OptimizerUnavailableError,
    optimize_weights,
)
from kuru.services.presets import default_preset
from kuru.services.reviews import reschedule_cards

router = APIRouter(prefix="/presets", tags=["presets"])

_COPY_EXCLUDE = {"id", "user_id", "name", "anki_id", "anki_mod", "anki_usn", "anki_raw"}


def _owned(session: SessionDep, user: CurrentUser, preset_id: int) -> DeckConfig:
    preset = session.get(DeckConfig, preset_id)
    if preset is None or preset.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Preset not found")
    return preset


@router.get("")
def list_presets(session: SessionDep, user: CurrentUser) -> list[PresetOut]:
    default = default_preset(session, user)
    session.commit()
    presets = session.exec(
        select(DeckConfig).where(DeckConfig.user_id == user.id).order_by(col(DeckConfig.id))
    )
    return [preset_out(session, p, default.id) for p in presets]


@router.post("", status_code=status.HTTP_201_CREATED)
def create_preset(body: PresetCreate, session: SessionDep, user: CurrentUser) -> PresetOut:
    assert user.id is not None
    preset = DeckConfig(user_id=user.id, name=body.name)
    if body.copy_from is not None:
        source = _owned(session, user, body.copy_from)
        for key in DeckConfig.model_fields:
            if key not in _COPY_EXCLUDE:
                setattr(preset, key, getattr(source, key))
    for key, value in body.model_dump(exclude_none=True, exclude={"copy_from"}).items():
        setattr(preset, key, value)
    preset.updated_at = utcnow()
    session.add(preset)
    session.commit()
    session.refresh(preset)
    return preset_out(session, preset, default_preset(session, user).id)


@router.get("/{preset_id}")
def get_preset(preset_id: int, session: SessionDep, user: CurrentUser) -> PresetOut:
    return preset_out(session, _owned(session, user, preset_id), default_preset(session, user).id)


@router.patch("/{preset_id}")
def update_preset(
    preset_id: int, body: PresetUpdate, session: SessionDep, user: CurrentUser
) -> PresetOut:
    preset = _owned(session, user, preset_id)
    for key, value in body.model_dump(exclude_unset=True).items():
        if key == "fsrs_weights":
            value = value or None
        elif value is None:
            continue
        setattr(preset, key, value)
    preset.updated_at = utcnow()
    session.add(preset)
    session.commit()
    session.refresh(preset)
    return preset_out(session, preset, default_preset(session, user).id)


@router.delete("/{preset_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_preset(preset_id: int, session: SessionDep, user: CurrentUser) -> Response:
    preset = _owned(session, user, preset_id)
    default = default_preset(session, user)
    if preset.id == default.id:
        raise HTTPException(status.HTTP_409_CONFLICT, "The default preset cannot be deleted")
    for deck in session.exec(select(Deck).where(Deck.config_id == preset.id)):
        deck.config_id = default.id
        deck.updated_at = utcnow()
        session.add(deck)
    session.delete(preset)
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def _cards_using(session: SessionDep, user: CurrentUser, preset: DeckConfig) -> list[Card]:
    default = default_preset(session, user)
    deck_filter = col(Deck.config_id) == preset.id
    if preset.id == default.id:
        deck_filter = deck_filter | col(Deck.config_id).is_(None)
    deck_ids = list(session.exec(select(Deck.id).where(Deck.user_id == user.id, deck_filter)))
    return list(session.exec(select(Card).where(col(Card.deck_id).in_(deck_ids))))


@router.post("/{preset_id}/optimize")
def optimize(
    preset_id: int, session: SessionDep, user: CurrentUser, apply: bool = False
) -> OptimizeResult:
    """Fit FSRS weights to the review history of all cards using this preset.

    With ``apply=true`` the weights are saved and the affected cards rescheduled.
    """
    preset = _owned(session, user, preset_id)
    cards = _cards_using(session, user, preset)
    card_ids = [c.id for c in cards]
    reviews = session.exec(
        select(ReviewLog.card_id, ReviewLog.rating, ReviewLog.reviewed_at).where(
            col(ReviewLog.card_id).in_(card_ids), col(ReviewLog.rating) > 0
        )
    ).all()
    try:
        weights = optimize_weights(reviews)
    except OptimizerUnavailableError as exc:
        raise HTTPException(status.HTTP_501_NOT_IMPLEMENTED, str(exc)) from exc
    except NotEnoughReviewsError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(exc)) from exc
    rescheduled = 0
    if apply:
        preset.fsrs_weights = list(weights)
        preset.updated_at = utcnow()
        session.add(preset)
        session.commit()
        rescheduled = reschedule_cards(session, user, cards)
    return OptimizeResult(
        weights=list(weights),
        review_count=len(reviews),
        applied=apply,
        rescheduled_cards=rescheduled,
    )


@router.post("/{preset_id}/reschedule")
def reschedule(preset_id: int, session: SessionDep, user: CurrentUser) -> dict[str, int]:
    """Recompute every card using this preset from its review history."""
    preset = _owned(session, user, preset_id)
    return {
        "rescheduled_cards": reschedule_cards(session, user, _cards_using(session, user, preset))
    }
