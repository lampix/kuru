"""Aggregate API router mounted under ``/api``."""

from __future__ import annotations

from fastapi import APIRouter

from kuru.api.routes import (
    auth,
    cards,
    decks,
    health,
    imports,
    media,
    presets,
    scheduling,
    stats,
    sync,
)

api_router = APIRouter(prefix="/api")
api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(scheduling.router)
api_router.include_router(imports.router)
api_router.include_router(decks.router)
api_router.include_router(presets.router)
api_router.include_router(cards.router)
api_router.include_router(sync.router)
api_router.include_router(media.router)
api_router.include_router(stats.router)
