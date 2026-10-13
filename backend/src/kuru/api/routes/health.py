"""Liveness endpoint."""

from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

from kuru import __version__

router = APIRouter(tags=["health"])


class Health(BaseModel):
    status: str
    version: str


@router.get("/health")
def health() -> Health:
    """Report that the service is up."""
    return Health(status="ok", version=__version__)
