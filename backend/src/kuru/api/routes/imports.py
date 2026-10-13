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
#: Maximum size of one chunk of a resumable upload. Below Next.js' 10 MB proxy body limit and
#: typical reverse proxy limits once divided further by clients.
MAX_CHUNK_BYTES = 8 * 1024 * 1024
UPLOADING = "uploading"


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


class UploadCreate(BaseModel):
    filename: str
    size: int


class UploadState(BaseModel):
    job_id: str
    received: int
    size: int
    max_chunk_bytes: int = MAX_CHUNK_BYTES


def _validate_filename(name: str | None) -> str:
    filename = Path(name or "upload.apkg").name
    if Path(filename).suffix.lower() not in ALLOWED_SUFFIXES:
        raise HTTPException(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, "Expected .apkg or .colpkg")
    return filename[:1024]


def _uploading_job(session: SessionDep, user: CurrentUser, job_id: str) -> ImportJob:
    job = session.get(ImportJob, job_id)
    if job is None or job.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Upload not found")
    if job.stage != UPLOADING:
        raise HTTPException(status.HTTP_409_CONFLICT, "Upload already completed")
    return job


def _part_path(settings: SettingsDep, job_id: str) -> Path:
    return settings.upload_dir / f"{job_id}.part"


@router.post("/uploads", status_code=status.HTTP_201_CREATED)
def create_upload(
    body: UploadCreate, session: SessionDep, user: CurrentUser, settings: SettingsDep
) -> UploadState:
    """Start a resumable, chunked upload (for large files and proxies with body limits)."""
    filename = _validate_filename(body.filename)
    if body.size <= 0 or body.size > settings.max_upload_mb * 1024 * 1024:
        raise HTTPException(
            status.HTTP_413_CONTENT_TOO_LARGE, f"File exceeds {settings.max_upload_mb} MB"
        )
    assert user.id is not None
    job = ImportJob(user_id=user.id, filename=filename, stage=UPLOADING, stats={"size": body.size})
    session.add(job)
    session.commit()
    _part_path(settings, job.id).touch()
    return UploadState(job_id=job.id, received=0, size=body.size)


@router.get("/uploads/{job_id}")
def upload_state(
    job_id: str, session: SessionDep, user: CurrentUser, settings: SettingsDep
) -> UploadState:
    """How many bytes have been received (to resume an interrupted upload)."""
    job = _uploading_job(session, user, job_id)
    part = _part_path(settings, job_id)
    return UploadState(
        job_id=job_id,
        received=part.stat().st_size if part.exists() else 0,
        size=int(job.stats["size"]),
    )


@router.put("/uploads/{job_id}")
async def upload_chunk(
    job_id: str,
    offset: int,
    request: Request,
    session: SessionDep,
    user: CurrentUser,
    settings: SettingsDep,
) -> UploadState:
    """Append a chunk at ``offset``. Re-sending an already received chunk is a no-op."""
    job = _uploading_job(session, user, job_id)
    size = int(job.stats["size"])
    part = _part_path(settings, job_id)
    received = part.stat().st_size if part.exists() else 0
    data = await request.body()
    if len(data) > MAX_CHUNK_BYTES:
        raise HTTPException(status.HTTP_413_CONTENT_TOO_LARGE, "Chunk too large")
    if offset + len(data) <= received:
        return UploadState(job_id=job_id, received=received, size=size)  # duplicate chunk
    if offset != received:
        raise HTTPException(status.HTTP_409_CONFLICT, f"Expected offset {received}")
    if received + len(data) > size:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "More data than announced")
    with part.open("ab") as out:
        out.write(data)
    return UploadState(job_id=job_id, received=received + len(data), size=size)


@router.post("/uploads/{job_id}/complete", status_code=status.HTTP_202_ACCEPTED)
def complete_upload(
    job_id: str,
    request: Request,
    background: BackgroundTasks,
    session: SessionDep,
    user: CurrentUser,
    settings: SettingsDep,
) -> ImportJobOut:
    """Finish a chunked upload and start the import."""
    job = _uploading_job(session, user, job_id)
    part = _part_path(settings, job_id)
    if not part.exists() or part.stat().st_size != int(job.stats["size"]):
        raise HTTPException(status.HTTP_409_CONFLICT, "Upload incomplete")
    target = settings.upload_dir / f"{job.id}.zip"
    part.rename(target)
    job.stage = "queued"
    job.stats = {}
    session.add(job)
    session.commit()
    session.refresh(job)
    background.add_task(run_import_job, request.app.state.engine, settings, job.id, target)
    return ImportJobOut.from_job(job)


@router.post("", status_code=status.HTTP_202_ACCEPTED)
async def upload(
    file: UploadFile,
    request: Request,
    background: BackgroundTasks,
    session: SessionDep,
    user: CurrentUser,
    settings: SettingsDep,
) -> ImportJobOut:
    """Upload an ``.apkg``/``.colpkg`` file in one request. Returns immediately with a job to poll.

    Browsers use the chunked ``/import/uploads`` endpoints instead, which work behind proxies
    with request size limits; this endpoint is convenient for scripts (``curl -F file=@…``).
    """
    filename = _validate_filename(file.filename)
    assert user.id is not None
    job = ImportJob(user_id=user.id, filename=filename)
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
