"""Shared building blocks for table models."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import JSON, BigInteger, Integer, String
from sqlmodel import Field, SQLModel

from kuru.core.time import utcnow
from kuru.db.types import UTCDateTime


def utc_field(**kwargs: Any) -> Any:
    """A timezone-aware UTC datetime column."""
    return Field(sa_type=UTCDateTime, **kwargs)


def json_field(**kwargs: Any) -> Any:
    """A JSON column."""
    return Field(sa_type=JSON(none_as_null=True), **kwargs)


def int_enum_field(**kwargs: Any) -> Any:
    """An ``IntEnum`` column stored as its integer value (Anki-compatible)."""
    return Field(sa_type=Integer, **kwargs)


def str_enum_field(**kwargs: Any) -> Any:
    """A ``StrEnum`` column stored as its string value."""
    return Field(sa_type=String(32), **kwargs)


class OwnedModel(SQLModel):
    """Mixin for rows that belong to a user (see ADR 0003)."""

    user_id: int = Field(foreign_key="user.id", index=True, ondelete="CASCADE")


class TimestampedModel(SQLModel):
    """Mixin adding a modification timestamp used for delta sync."""

    updated_at: datetime = utc_field(default_factory=utcnow, index=True)


class AnkiIdentity(SQLModel):
    """Mixin preserving Anki identity for lossless export / sync (see roadmap)."""

    anki_id: int | None = Field(default=None, index=True, sa_type=BigInteger)
    anki_mod: int | None = Field(default=None, sa_type=BigInteger)
    anki_usn: int | None = None
