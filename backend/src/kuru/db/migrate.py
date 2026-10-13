"""Programmatic access to Alembic migrations."""

from __future__ import annotations

from pathlib import Path

from alembic import command
from alembic.config import Config

from kuru.core.config import get_settings

MIGRATIONS_DIR = Path(__file__).resolve().parents[1] / "migrations"


def alembic_config(url: str | None = None) -> Config:
    """Build an Alembic config pointing at the bundled migrations."""
    config = Config()
    config.set_main_option("script_location", str(MIGRATIONS_DIR))
    config.set_main_option("sqlalchemy.url", url or get_settings().resolved_database_url)
    return config


def upgrade(url: str | None = None, revision: str = "head") -> None:
    """Upgrade the database schema to ``revision``."""
    command.upgrade(alembic_config(url), revision)
