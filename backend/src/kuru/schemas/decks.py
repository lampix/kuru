"""Deck and study queue models."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field

from kuru.schemas.scheduling import CardMemory


class DeckCountsOut(BaseModel):
    new: int
    learning: int
    review: int
    total: int


class DeckOut(BaseModel):
    id: int
    name: str
    short_name: str
    description: str
    config_id: int | None
    counts: DeckCountsOut
    children: list[DeckOut] = Field(default_factory=list)


class DeckCreate(BaseModel):
    name: str = Field(min_length=1, max_length=500)
    description: str = ""
    config_id: int | None = None


class DeckUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=500)
    description: str | None = None
    config_id: int | None = None


class NoteTypeOut(BaseModel):
    id: int
    name: str
    kind: int
    fields: list[dict[str, object]]
    templates: list[dict[str, object]]
    css: str
    updated_at: datetime


class StudyCard(BaseModel):
    """Everything a client needs to render and schedule a card."""

    id: int
    note_id: int
    deck_id: int
    ord: int
    note_type_id: int
    fields: list[str]
    tags: list[str]
    memory: CardMemory
    position: int
    flags: int


class StudyQueueOut(BaseModel):
    deck_id: int
    preset_id: int
    new_remaining: int
    review_remaining: int
    learning: list[StudyCard]
    review: list[StudyCard]
    new: list[StudyCard]
    note_types: list[NoteTypeOut]
    day_ends_at: datetime
