"""Background import jobs."""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import Any
from uuid import uuid4

from sqlmodel import Field

from kuru.core.time import utcnow
from kuru.models.base import OwnedModel, json_field, str_enum_field, utc_field


class ImportStatus(StrEnum):
    """Lifecycle of an import job."""

    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class ImportJob(OwnedModel, table=True):
    """Tracks progress of an asynchronous Anki import."""

    __tablename__ = "import_job"

    id: str = Field(default_factory=lambda: str(uuid4()), primary_key=True, max_length=36)
    filename: str = Field(max_length=1024)
    status: ImportStatus = str_enum_field(default=ImportStatus.PENDING)
    stage: str = Field(default="queued", max_length=64)
    progress: float = Field(default=0.0, ge=0.0, le=1.0)
    message: str | None = None
    stats: dict[str, Any] = json_field(default_factory=dict)
    created_at: datetime = utc_field(default_factory=utcnow)
    finished_at: datetime | None = utc_field(default=None)
