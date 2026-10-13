"""Deck option preset models."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from kuru.models import NewCardOrder
from kuru.services.fsrs import FSRS6_PARAM_COUNT


def _validate_steps(steps: list[float] | None) -> list[float] | None:
    if steps is None:
        return None
    if any(step <= 0 or step > 60 * 24 * 365 for step in steps):
        raise ValueError("steps must be positive minutes")
    return steps


class PresetFields(BaseModel):
    """Editable preset fields (all optional for PATCH)."""

    name: str | None = Field(default=None, min_length=1, max_length=200)
    desired_retention: float | None = Field(default=None, ge=0.7, le=0.99)
    maximum_interval: int | None = Field(default=None, ge=1, le=36500)
    fsrs_weights: list[float] | None = None
    learning_steps: list[float] | None = Field(default=None, max_length=20)
    relearning_steps: list[float] | None = Field(default=None, max_length=20)
    enable_fuzz: bool | None = None
    new_per_day: int | None = Field(default=None, ge=0, le=9999)
    reviews_per_day: int | None = Field(default=None, ge=0, le=99999)
    new_card_order: NewCardOrder | None = None
    bury_new: bool | None = None
    bury_reviews: bool | None = None
    bury_interday_learning: bool | None = None
    autoplay_audio: bool | None = None
    show_answer_timer: int | None = Field(default=None, ge=0, le=600)

    _steps = field_validator("learning_steps", "relearning_steps")(_validate_steps)

    @field_validator("fsrs_weights")
    @classmethod
    def _weights(cls, weights: list[float] | None) -> list[float] | None:
        if weights is not None and len(weights) not in (0, 17, 19, FSRS6_PARAM_COUNT):
            raise ValueError(f"expected {FSRS6_PARAM_COUNT} weights")
        return weights or None


class PresetCreate(PresetFields):
    name: str = Field(min_length=1, max_length=200)
    copy_from: int | None = Field(default=None, description="Preset id to copy settings from")


class PresetUpdate(PresetFields):
    pass


class PresetOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    desired_retention: float
    maximum_interval: int
    fsrs_weights: list[float]
    weights_are_default: bool
    learning_steps: list[float]
    relearning_steps: list[float]
    enable_fuzz: bool
    new_per_day: int
    reviews_per_day: int
    new_card_order: NewCardOrder
    bury_new: bool
    bury_reviews: bool
    bury_interday_learning: bool
    autoplay_audio: bool
    show_answer_timer: int
    deck_count: int = 0
    is_default: bool = False
    updated_at: datetime


class OptimizeResult(BaseModel):
    weights: list[float]
    review_count: int
    applied: bool
    rescheduled_cards: int = 0
