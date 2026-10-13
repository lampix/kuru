"""Note types (models) and notes."""

from __future__ import annotations

from enum import IntEnum
from typing import Any

from sqlalchemy import UniqueConstraint
from sqlmodel import Field

from kuru.models.base import (
    AnkiIdentity,
    OwnedModel,
    TimestampedModel,
    int_enum_field,
    json_field,
)


class NoteTypeKind(IntEnum):
    """Anki note type kind."""

    STANDARD = 0
    CLOZE = 1


class NoteType(OwnedModel, TimestampedModel, AnkiIdentity, table=True):
    """A note type: field names, card templates and shared CSS.

    ``fields`` is a list of ``{"name": str, "ord": int}``; ``templates`` a list of
    ``{"name": str, "ord": int, "qfmt": str, "afmt": str}``.
    """

    __tablename__ = "note_type"

    id: int | None = Field(default=None, primary_key=True)
    name: str = Field(max_length=500)
    kind: NoteTypeKind = int_enum_field(default=NoteTypeKind.STANDARD)
    fields: list[dict[str, Any]] = json_field(default_factory=list)
    templates: list[dict[str, Any]] = json_field(default_factory=list)
    css: str = ""
    anki_raw: dict[str, Any] | None = json_field(default=None)


class Note(OwnedModel, TimestampedModel, AnkiIdentity, table=True):
    """A note holding field values; one note produces one or more cards."""

    __table_args__ = (UniqueConstraint("user_id", "guid"),)

    id: int | None = Field(default=None, primary_key=True)
    guid: str = Field(max_length=64)
    note_type_id: int = Field(foreign_key="note_type.id", index=True, ondelete="CASCADE")
    fields: list[str] = json_field(default_factory=list)
    tags: list[str] = json_field(default_factory=list)
    sort_field: str = Field(default="", index=True)
