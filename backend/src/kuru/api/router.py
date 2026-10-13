"""Aggregate API router mounted under ``/api``."""

from __future__ import annotations

from fastapi import APIRouter

from kuru.api.routes import auth, health, scheduling

api_router = APIRouter(prefix="/api")
api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(scheduling.router)
