"""Running imports in the background and tracking their progress.

SQLite permits a single writer, and the import holds a long write transaction. Live progress is
therefore kept in an in-process registry; the ``import_job`` row is written when the job starts
and finishes. (Kuru runs as a single process; a multi-worker deployment would move this registry
to the database or a cache.)
"""

from __future__ import annotations

import logging
import threading
from dataclasses import dataclass
from pathlib import Path

from sqlalchemy import Engine
from sqlmodel import Session

from kuru.core.config import Settings
from kuru.core.time import utcnow
from kuru.models import ImportJob, ImportStatus, User
from kuru.services.importer.importer import AnkiImporter
from kuru.services.importer.package import InvalidPackageError, open_package

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class LiveProgress:
    stage: str
    progress: float


class ProgressRegistry:
    """Thread-safe map of job id → live progress."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._items: dict[str, LiveProgress] = {}

    def set(self, job_id: str, stage: str, progress: float) -> None:
        with self._lock:
            self._items[job_id] = LiveProgress(stage, round(min(max(progress, 0.0), 1.0), 3))

    def get(self, job_id: str) -> LiveProgress | None:
        with self._lock:
            return self._items.get(job_id)

    def clear(self, job_id: str) -> None:
        with self._lock:
            self._items.pop(job_id, None)


registry = ProgressRegistry()


def _finish(
    engine: Engine, job_id: str, status: ImportStatus, message: str | None, stats: dict[str, object]
) -> None:
    with Session(engine) as session:
        job = session.get(ImportJob, job_id)
        if job is None:
            return
        job.status = status
        job.message = message
        job.stats = stats
        job.progress = 1.0 if status == ImportStatus.COMPLETED else job.progress
        job.stage = "done" if status == ImportStatus.COMPLETED else "failed"
        job.finished_at = utcnow()
        session.add(job)
        session.commit()


def run_import_job(engine: Engine, settings: Settings, job_id: str, archive: Path) -> None:
    """Execute an import job. Designed to run in FastAPI's background task thread pool."""
    with Session(engine) as session:
        job = session.get(ImportJob, job_id)
        if job is None:
            return
        job.status, job.stage = ImportStatus.PROCESSING, "extracting"
        session.add(job)
        session.commit()
        user_id = job.user_id
    registry.set(job_id, "extracting", 0.02)

    try:
        with Session(engine) as session:
            user = session.get(User, user_id)
            assert user is not None
            workdir = settings.upload_dir / f"{job_id}.d"
            with open_package(archive, workdir) as package:
                importer = AnkiImporter(
                    session,
                    user,
                    settings.media_dir,
                    progress=lambda stage, fraction: registry.set(job_id, stage, fraction),
                )
                stats = importer.run(package)
        _finish(engine, job_id, ImportStatus.COMPLETED, None, stats.as_dict())
    except InvalidPackageError as exc:
        _finish(engine, job_id, ImportStatus.FAILED, str(exc), {})
    except Exception as exc:
        logger.exception("Import %s failed", job_id)
        _finish(engine, job_id, ImportStatus.FAILED, f"Import failed: {exc}", {})
    finally:
        registry.clear(job_id)
        archive.unlink(missing_ok=True)
