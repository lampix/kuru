"""Cards and their FSRS memory state."""

from __future__ import annotations

from datetime import datetime
from enum import IntEnum

from sqlalchemy import Index
from sqlmodel import Field

from kuru.models.base import (
    AnkiIdentity,
    OwnedModel,
    TimestampedModel,
    int_enum_field,
    utc_field,
)


class CardState(IntEnum):
    """Learning state. Values 1-3 match ``fsrs.State``; 0 marks a card never studied."""

    NEW = 0
    LEARNING = 1
    REVIEW = 2
    RELEARNING = 3


class Card(OwnedModel, TimestampedModel, AnkiIdentity, table=True):
    """A single reviewable card produced from a note and a template (or cloze ordinal)."""

    __table_args__ = (
        Index("ix_card_user_deck_due", "user_id", "deck_id", "due"),
        Index("ix_card_user_state", "user_id", "state"),
    )

    id: int | None = Field(default=None, primary_key=True)
    note_id: int = Field(foreign_key="note.id", index=True, ondelete="CASCADE")
    deck_id: int = Field(foreign_key="deck.id", index=True, ondelete="CASCADE")
    ord: int = Field(default=0, description="Template index, or cloze number minus one.")

    # FSRS memory state
    state: CardState = int_enum_field(default=CardState.NEW)
    step: int | None = None
    stability: float | None = None
    difficulty: float | None = None
    due: datetime | None = utc_field(default=None)
    last_review: datetime | None = utc_field(default=None)

    # Queue management
    position: int = Field(default=0, description="Order among new cards.")
    suspended: bool = False
    buried_until: datetime | None = utc_field(default=None)
    flags: int = 0

    # Counters
    reps: int = 0
    lapses: int = 0
