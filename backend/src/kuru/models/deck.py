"""Decks and deck option presets."""

from __future__ import annotations

from enum import StrEnum
from typing import Any

from sqlalchemy import UniqueConstraint
from sqlmodel import Field

from kuru.models.base import (
    AnkiIdentity,
    OwnedModel,
    TimestampedModel,
    json_field,
    str_enum_field,
)


class NewCardOrder(StrEnum):
    """Order in which new cards are introduced."""

    SEQUENTIAL = "sequential"
    RANDOM = "random"


class DeckConfig(OwnedModel, TimestampedModel, AnkiIdentity, table=True):
    """A deck options preset, shareable between decks (like Anki's option groups)."""

    __tablename__ = "deck_config"

    id: int | None = Field(default=None, primary_key=True)
    name: str = Field(default="Default", max_length=200)

    # FSRS scheduling
    desired_retention: float = Field(default=0.9, ge=0.7, le=0.99)
    maximum_interval: int = Field(default=36500, ge=1, le=36500)
    fsrs_weights: list[float] | None = json_field(default=None)
    learning_steps: list[float] = json_field(default_factory=lambda: [1.0, 10.0])
    relearning_steps: list[float] = json_field(default_factory=lambda: [10.0])
    enable_fuzz: bool = True

    # Daily limits
    new_per_day: int = Field(default=20, ge=0)
    reviews_per_day: int = Field(default=200, ge=0)
    new_card_order: NewCardOrder = str_enum_field(default=NewCardOrder.SEQUENTIAL)

    # Burying
    bury_new: bool = False
    bury_reviews: bool = False
    bury_interday_learning: bool = False

    # Card & media behaviour
    autoplay_audio: bool = True
    show_answer_timer: int = Field(default=0, ge=0, description="Seconds; 0 disables the timer.")

    anki_raw: dict[str, Any] | None = json_field(default=None)


class Deck(OwnedModel, TimestampedModel, AnkiIdentity, table=True):
    """A deck. Hierarchy is encoded in ``name`` using Anki's ``Parent::Child`` convention."""

    __table_args__ = (UniqueConstraint("user_id", "name"),)

    id: int | None = Field(default=None, primary_key=True)
    name: str = Field(max_length=500)
    description: str = ""
    config_id: int | None = Field(default=None, foreign_key="deck_config.id", ondelete="SET NULL")
    is_filtered: bool = False
    anki_raw: dict[str, Any] | None = json_field(default=None)
