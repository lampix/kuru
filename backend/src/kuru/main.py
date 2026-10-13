"""FastAPI application factory."""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from kuru import __version__
from kuru.api.router import api_router
from kuru.core.config import Settings, get_settings
from kuru.core.security import SingleUserAuthProvider
from kuru.db.session import build_engine


def create_app(settings: Settings | None = None) -> FastAPI:
    """Build the FastAPI application."""
    settings = settings or get_settings()
    settings.ensure_directories()

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        if settings.auto_migrate:
            from kuru.db.migrate import upgrade

            upgrade(settings.resolved_database_url)
        yield
        app.state.engine.dispose()

    app = FastAPI(
        title="Kuru API",
        version=__version__,
        summary="Anki-compatible spaced repetition backend powered by FSRS.",
        lifespan=lifespan,
    )
    app.state.settings = settings
    app.state.engine = build_engine(settings.resolved_database_url)
    app.state.auth_provider = SingleUserAuthProvider(settings)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(api_router)
    return app


app = create_app()
