"""Serving media files referenced by notes."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request, Response, status
from fastapi.responses import FileResponse
from sqlmodel import select

from kuru.api.deps import CurrentUser, SessionDep, SettingsDep
from kuru.models import MediaFile
from kuru.services.importer import media_path

router = APIRouter(prefix="/media", tags=["media"])


@router.get("/{filename:path}", response_model=None)
def get_media(
    filename: str, request: Request, session: SessionDep, user: CurrentUser, settings: SettingsDep
) -> Response:
    """Return a media file by the name used in note fields."""
    media = session.exec(
        select(MediaFile).where(MediaFile.user_id == user.id, MediaFile.filename == filename)
    ).first()
    if media is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Media not found")
    etag = f'"{media.sha256}"'
    headers = {"ETag": etag, "Cache-Control": "private, max-age=86400"}
    if request.headers.get("if-none-match") == etag:
        return Response(status_code=status.HTTP_304_NOT_MODIFIED, headers=headers)
    path = media_path(settings.media_dir, media.sha256)
    if not path.is_file():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Media file missing on disk")
    return FileResponse(path, media_type=media.mime_type, headers=headers)
