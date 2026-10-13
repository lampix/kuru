"""Users and their preferences."""

from __future__ import annotations

from datetime import datetime

from sqlmodel import Field

from kuru.core.time import utcnow
from kuru.models.base import TimestampedModel, utc_field


class User(TimestampedModel, table=True):
    """A learner. v1 runs in single-user mode with exactly one row."""

    id: int | None = Field(default=None, primary_key=True)
    name: str = Field(default="Learner", max_length=120)
    timezone: str = Field(default="UTC", max_length=64)
    day_rollover_hour: int = Field(default=4, ge=0, le=23)
    created_at: datetime = utc_field(default_factory=utcnow)
