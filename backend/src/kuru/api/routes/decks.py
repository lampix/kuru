"""Decks, the deck tree with due counts, and the study queue."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Response, status
from sqlmodel import col, select

from kuru.api.deps import CurrentUser, SessionDep
from kuru.api.serializers import note_types_for, study_cards
from kuru.core.time import utcnow
from kuru.models import Card, Deck, DeckConfig
from kuru.schemas.decks import (
    DeckCountsOut,
    DeckCreate,
    DeckOut,
    DeckUpdate,
    StudyQueueOut,
)
from kuru.services.presets import preset_for_deck
from kuru.services.queue import DayContext, DeckNode, build_queue, deck_tree, subtree_ids

router = APIRouter(prefix="/decks", tags=["decks"])


def _node_out(node: DeckNode) -> DeckOut:
    deck = node.deck
    assert deck.id is not None
    return DeckOut(
        id=deck.id,
        name=deck.name,
        short_name=deck.name.rpartition("::")[2],
        description=deck.description,
        config_id=deck.config_id,
        counts=DeckCountsOut(
            new=node.counts.new,
            learning=node.counts.learning,
            review=node.counts.review,
            total=node.counts.total,
        ),
        children=[_node_out(child) for child in node.children],
    )


def _owned(session: SessionDep, user: CurrentUser, deck_id: int) -> Deck:
    deck = session.get(Deck, deck_id)
    if deck is None or deck.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Deck not found")
    return deck


def _check_preset(session: SessionDep, user: CurrentUser, config_id: int | None) -> None:
    if config_id is not None:
        preset = session.get(DeckConfig, config_id)
        if preset is None or preset.user_id != user.id:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Unknown preset")


def _find(nodes: list[DeckNode], deck_id: int) -> DeckNode | None:
    for node in nodes:
        if node.deck.id == deck_id:
            return node
        if found := _find(node.children, deck_id):
            return found
    return None


@router.get("")
def list_decks(session: SessionDep, user: CurrentUser) -> list[DeckOut]:
    """The deck tree with today's new / learning / review counts."""
    return [_node_out(node) for node in deck_tree(session, user, utcnow())]


@router.post("", status_code=status.HTTP_201_CREATED)
def create_deck(body: DeckCreate, session: SessionDep, user: CurrentUser) -> DeckOut:
    assert user.id is not None
    name = "::".join(part.strip() for part in body.name.split("::") if part.strip())
    if not name:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Invalid deck name")
    _check_preset(session, user, body.config_id)
    existing = {d.name for d in session.exec(select(Deck).where(Deck.user_id == user.id))}
    if name in existing:
        raise HTTPException(status.HTTP_409_CONFLICT, "A deck with this name exists")
    parts = name.split("::")
    for depth in range(1, len(parts)):
        parent = "::".join(parts[:depth])
        if parent not in existing:
            session.add(Deck(user_id=user.id, name=parent, config_id=body.config_id))
            existing.add(parent)
    deck = Deck(user_id=user.id, name=name, description=body.description, config_id=body.config_id)
    session.add(deck)
    session.commit()
    session.refresh(deck)
    assert deck.id is not None
    node = _find(deck_tree(session, user, utcnow()), deck.id)
    assert node is not None
    return _node_out(node)


@router.get("/{deck_id}")
def get_deck(deck_id: int, session: SessionDep, user: CurrentUser) -> DeckOut:
    _owned(session, user, deck_id)
    node = _find(deck_tree(session, user, utcnow()), deck_id)
    assert node is not None
    return _node_out(node)


@router.patch("/{deck_id}")
def update_deck(deck_id: int, body: DeckUpdate, session: SessionDep, user: CurrentUser) -> DeckOut:
    deck = _owned(session, user, deck_id)
    now = utcnow()
    if "config_id" in body.model_fields_set:
        _check_preset(session, user, body.config_id)
        deck.config_id = body.config_id
    if body.description is not None:
        deck.description = body.description
    if body.name is not None and body.name != deck.name:
        new_name = "::".join(p.strip() for p in body.name.split("::") if p.strip())
        decks = session.exec(select(Deck).where(Deck.user_id == user.id)).all()
        if any(d.name == new_name for d in decks):
            raise HTTPException(status.HTTP_409_CONFLICT, "A deck with this name exists")
        old_prefix = deck.name + "::"
        for child in decks:
            if child.name.startswith(old_prefix):
                child.name = new_name + "::" + child.name[len(old_prefix) :]
                child.updated_at = now
                session.add(child)
        deck.name = new_name
    deck.updated_at = now
    session.add(deck)
    session.commit()
    return get_deck(deck_id, session, user)


@router.delete("/{deck_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_deck(deck_id: int, session: SessionDep, user: CurrentUser) -> Response:
    """Delete a deck, its sub-decks and their cards."""
    deck = _owned(session, user, deck_id)
    decks = session.exec(select(Deck).where(Deck.user_id == user.id)).all()
    ids = subtree_ids(decks, deck)
    for card in session.exec(select(Card).where(col(Card.deck_id).in_(ids))):
        session.delete(card)
    for d in decks:
        if d.id in ids:
            session.delete(d)
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{deck_id}/due")
def due_cards(deck_id: int, session: SessionDep, user: CurrentUser) -> StudyQueueOut:
    """Today's study queue for a deck (including sub-decks)."""
    deck = _owned(session, user, deck_id)
    now = utcnow()
    queue = build_queue(session, user, deck, now)
    learning = study_cards(session, queue.learning)
    review = study_cards(session, queue.review)
    new = study_cards(session, queue.new)
    preset = preset_for_deck(session, user, deck)
    session.commit()
    assert preset.id is not None
    return StudyQueueOut(
        deck_id=deck_id,
        preset_id=preset.id,
        new_remaining=queue.new_remaining,
        review_remaining=queue.review_remaining,
        learning=learning,
        review=review,
        new=new,
        note_types=note_types_for(session, {c.note_type_id for c in [*learning, *review, *new]}),
        day_ends_at=DayContext.for_user(user, now).end,
    )
