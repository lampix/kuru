"""Helpers for building test data."""

from __future__ import annotations

from datetime import datetime, timedelta
from uuid import uuid4

from sqlmodel import Session, select

from kuru.models import Card, CardState, Deck, Note, NoteType, User


def get_or_create_deck(session: Session, user: User, name: str = "Default") -> Deck:
    assert user.id is not None
    deck = session.exec(select(Deck).where(Deck.user_id == user.id, Deck.name == name)).first()
    if deck is None:
        deck = Deck(user_id=user.id, name=name)
        session.add(deck)
        session.flush()
    return deck


def make_card(
    session: Session, user: User, *, deck_name: str = "Default", ordinal: int = 0
) -> Card:
    """Create a note type, deck, note and card."""
    assert user.id is not None
    note_type = NoteType(
        user_id=user.id,
        name="Basic",
        fields=[{"name": "Front", "ord": 0}, {"name": "Back", "ord": 1}],
        templates=[{"name": "Card 1", "ord": 0, "qfmt": "{{Front}}", "afmt": "{{Back}}"}],
    )
    session.add(note_type)
    deck = get_or_create_deck(session, user, deck_name)
    session.flush()
    assert note_type.id is not None and deck.id is not None
    note = Note(
        user_id=user.id, guid=uuid4().hex[:10], note_type_id=note_type.id, fields=["Q", "A"]
    )
    session.add(note)
    session.flush()
    assert note.id is not None
    card = Card(user_id=user.id, note_id=note.id, deck_id=deck.id, ord=ordinal)
    session.add(card)
    session.commit()
    session.refresh(card)
    return card


def make_review_card(
    session: Session, user: User, *, due: datetime, deck_name: str = "Default"
) -> Card:
    """A card in the review state, due at ``due``."""
    card = make_card(session, user, deck_name=deck_name)
    card.state = CardState.REVIEW
    card.stability, card.difficulty = 10.0, 5.0
    card.due = due
    card.last_review = due - timedelta(days=10)
    card.reps = 3
    session.add(card)
    session.commit()
    session.refresh(card)
    return card


def add_sibling(session: Session, user: User, card: Card) -> Card:
    """Another card of the same note."""
    assert user.id is not None
    sibling = Card(user_id=user.id, note_id=card.note_id, deck_id=card.deck_id, ord=card.ord + 1)
    session.add(sibling)
    session.commit()
    session.refresh(sibling)
    return sibling
