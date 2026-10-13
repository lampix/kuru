"""Helpers for building test data."""

from __future__ import annotations

from uuid import uuid4

from sqlmodel import Session, select

from kuru.models import Card, Deck, Note, NoteType, User


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
