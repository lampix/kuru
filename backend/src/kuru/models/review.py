"""The review log — the append-only source of truth for card memory state."""

from __future__ import annotations

from datetime import datetime
from enum import IntEnum
from uuid import uuid4

from sqlalchemy import BigInteger, Index
from sqlmodel import Field

from kuru.models.base import AnkiIdentity, OwnedModel, int_enum_field, utc_field


class ReviewKind(IntEnum):
    """Mirror of Anki's ``revlog.type``."""

    LEARN = 0
    REVIEW = 1
    RELEARN = 2
    FILTERED = 3
    MANUAL = 4  # rescheduled / forgotten by the user; carries no rating
    RESCHEDULED = 5


class ReviewLog(OwnedModel, AnkiIdentity, table=True):
    """One answer to a card.

    The primary key is a client-generated UUID so offline reviews can be synced idempotently.
    ``rating`` is 1-4 (Again..Easy) or 0 for manual entries such as *forget*.
    """

    __tablename__ = "review_log"
    __table_args__ = (Index("ix_review_card_time", "card_id", "reviewed_at"),)

    id: str = Field(default_factory=lambda: str(uuid4()), primary_key=True, max_length=36)
    anki_card_id: int | None = Field(default=None, sa_type=BigInteger)
    card_id: int = Field(foreign_key="card.id", index=True, ondelete="CASCADE")
    rating: int = Field(ge=0, le=4)
    reviewed_at: datetime = utc_field(index=True)
    duration_ms: int | None = Field(default=None, ge=0)
    kind: ReviewKind = int_enum_field(default=ReviewKind.REVIEW)

    # Values as recorded by Anki (kept for export fidelity and statistics).
    interval: int | None = Field(default=None, description="Anki ivl: days (>0) or -seconds (<0).")
    last_interval: int | None = None
    factor: int | None = None
