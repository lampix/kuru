"""Media files referenced by notes, stored content-addressed on disk."""

from __future__ import annotations

from sqlalchemy import UniqueConstraint
from sqlmodel import Field

from kuru.models.base import OwnedModel, TimestampedModel


class MediaFile(OwnedModel, TimestampedModel, table=True):
    """A media file. ``filename`` is the name used in note fields, ``sha256`` the blob on disk."""

    __tablename__ = "media_file"
    __table_args__ = (UniqueConstraint("user_id", "filename"),)

    id: int | None = Field(default=None, primary_key=True)
    filename: str = Field(max_length=1024)
    sha256: str = Field(max_length=64, index=True)
    size: int = 0
    mime_type: str = Field(default="application/octet-stream", max_length=200)
