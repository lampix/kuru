"""Engine and session factory."""

from __future__ import annotations

from collections.abc import Iterator
from typing import Any

from fastapi import Request
from sqlalchemy import Engine, event
from sqlmodel import Session, create_engine


def _configure_sqlite(dbapi_connection: Any, _record: Any) -> None:
    cursor = dbapi_connection.cursor()
    # WAL allows concurrent readers while an import is writing; foreign keys are off by default.
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.execute("PRAGMA synchronous=NORMAL")
    cursor.close()


def build_engine(url: str) -> Engine:
    """Create an engine with SQLite-specific tuning applied when relevant."""
    is_sqlite = url.startswith("sqlite")
    engine = create_engine(
        url,
        connect_args={"check_same_thread": False, "timeout": 30} if is_sqlite else {},
    )
    if is_sqlite:
        event.listen(engine, "connect", _configure_sqlite)
    return engine


def get_session(request: Request) -> Iterator[Session]:
    """FastAPI dependency yielding a session bound to the application's engine."""
    with Session(request.app.state.engine) as session:
        yield session
