"""Anki import endpoints."""

from __future__ import annotations

from datetime import datetime
from pathlib import Path
from typing import Any

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request, UploadFile, status
from pydantic import BaseModel
from sqlmodel import col, select

from kuru.api.deps import CurrentUser, SessionDep, SettingsDep
from kuru.models import ImportJob, ImportStatus
from kuru.services.importer import registry, run_import_job

router = APIRouter(prefix="/import", tags=["import"])

ALLOWED_SUFFIXES = {".apkg", ".colpkg"}
CHUNK = 1024 * 1024


class ImportJobOut(BaseModel):
    id: str
    filename: str
    status: ImportStatus
    stage: str
    progress: float
    message: str | None
    stats: dict[str, Any]
    created_at: datetime
    finished_at: datetime | None

    @classmethod
    def from_job(cls, job: ImportJob) -> ImportJobOut:
        out = cls.model_validate(job, from_attributes=True)
        live = registry.get(job.id)
        if live is not None and job.status == ImportStatus.PROCESSING:
            out.stage, out.progress = live.stage, live.progress
        return out


@router.post("", status_code=status.HTTP_202_ACCEPTED)
async def upload(
    file: UploadFile,
    request: Request,
    background: BackgroundTasks,
    session: SessionDep,
    user: CurrentUser,
    settings: SettingsDep,
) -> ImportJobOut:
    """Upload an ``.apkg``/``.colpkg`` file. Returns immediately with a job to poll."""
    filename = Path(file.filename or "upload.apkg").name
    if Path(filename).suffix.lower() not in ALLOWED_SUFFIXES:
        raise HTTPException(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, "Expected .apkg or .colpkg")
    assert user.id is not None
    job = ImportJob(user_id=user.id, filename=filename[:1024])
    target = settings.upload_dir / f"{job.id}.zip"
    limit = settings.max_upload_mb * 1024 * 1024
    written = 0
    try:
        with target.open("wb") as out:
            while chunk := await file.read(CHUNK):
                written += len(chunk)
                if written > limit:
                    raise HTTPException(
                        status.HTTP_413_CONTENT_TOO_LARGE,
                        f"File exceeds {settings.max_upload_mb} MB",
                    )
                out.write(chunk)
    except BaseException:
        target.unlink(missing_ok=True)
        raise
    session.add(job)
    session.commit()
    session.refresh(job)
    background.add_task(run_import_job, request.app.state.engine, settings, job.id, target)
    return ImportJobOut.from_job(job)


@router.get("/status/{job_id}")
def job_status(job_id: str, session: SessionDep, user: CurrentUser) -> ImportJobOut:
    """Poll the progress of an import."""
    job = session.get(ImportJob, job_id)
    if job is None or job.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Import job not found")
    return ImportJobOut.from_job(job)


@router.get("/jobs")
def list_jobs(session: SessionDep, user: CurrentUser, limit: int = 20) -> list[ImportJobOut]:
    """Recent import jobs, newest first."""
    jobs = session.exec(
        select(ImportJob)
        .where(ImportJob.user_id == user.id)
        .order_by(col(ImportJob.created_at).desc())
        .limit(min(limit, 100))
    )
    return [ImportJobOut.from_job(job) for job in jobs]
