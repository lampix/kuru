"""Offline synchronisation models."""

from __future__ import annotations

from datetime import datetime

from pydantic import AwareDatetime, BaseModel, Field

from kuru.schemas.decks import NoteTypeOut, StudyCard
from kuru.schemas.presets import PresetOut
from kuru.schemas.scheduling import CardMemory


class ReviewIn(BaseModel):
    """A review recorded on a client (possibly offline)."""

    id: str = Field(min_length=8, max_length=64, description="Client-generated UUID")
    card_id: int
    rating: int = Field(ge=1, le=4)
    reviewed_at: AwareDatetime
    duration_ms: int | None = Field(default=None, ge=0, le=60 * 60 * 1000)


class ReviewBatch(BaseModel):
    reviews: list[ReviewIn] = Field(max_length=5000)


class ReviewBatchResult(BaseModel):
    accepted: list[str]
    duplicates: list[str]
    rejected: dict[str, str]
    cards: list[CardMemory] = Field(description="Authoritative state of every affected card")
    server_time: datetime


class SyncDeck(BaseModel):
    id: int
    name: str
    description: str
    config_id: int | None
    updated_at: datetime


class SyncMeta(BaseModel):
    """Small, always fully transferred collection metadata."""

    server_time: datetime
    timezone: str
    day_rollover_hour: int
    decks: list[SyncDeck]
    presets: list[PresetOut]
    note_types: list[NoteTypeOut]
    card_count: int


class CardPage(BaseModel):
    cards: list[StudyCard]
    next_after_id: int | None = Field(description="Pass as after_id to fetch the next page")


class CardIds(BaseModel):
    card_ids: list[int]


class MediaEntryOut(BaseModel):
    filename: str
    sha256: str
    size: int
    mime_type: str
    updated_at: datetime
