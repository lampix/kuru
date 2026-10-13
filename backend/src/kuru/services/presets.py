"""Lookup of deck option presets."""

from __future__ import annotations

from sqlmodel import Session, select

from kuru.models import Card, Deck, DeckConfig, User


def default_preset(session: Session, user: User) -> DeckConfig:
    """Return the user's default preset, creating it on first use."""
    preset = session.exec(
        select(DeckConfig).where(DeckConfig.user_id == user.id).order_by(DeckConfig.id)  # type: ignore[arg-type]
    ).first()
    if preset is None:
        assert user.id is not None
        preset = DeckConfig(user_id=user.id, name="Default")
        session.add(preset)
        session.flush()
    return preset


def preset_for_deck(session: Session, user: User, deck: Deck) -> DeckConfig:
    """Return the preset governing ``deck`` (falling back to the default preset)."""
    if deck.config_id is not None:
        preset = session.get(DeckConfig, deck.config_id)
        if preset is not None and preset.user_id == user.id:
            return preset
    return default_preset(session, user)


def preset_for_card(session: Session, user: User, card: Card) -> DeckConfig:
    """Return the preset governing ``card``."""
    deck = session.get(Deck, card.deck_id)
    if deck is None:
        return default_preset(session, user)
    return preset_for_deck(session, user, deck)
