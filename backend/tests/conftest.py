"""Shared pytest fixtures."""

from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlmodel import Session

from kuru.core.config import Settings
from kuru.core.security import get_or_create_single_user
from kuru.main import create_app
from kuru.models import User


@pytest.fixture
def settings(tmp_path: Path) -> Settings:
    return Settings(data_dir=tmp_path / "data", access_token=None)


@pytest.fixture
def app(settings: Settings) -> FastAPI:
    return create_app(settings)


@pytest.fixture
def client(app: FastAPI) -> Iterator[TestClient]:
    with TestClient(app) as test_client:  # runs the lifespan (migrations)
        yield test_client


@pytest.fixture
def session(client: TestClient, app: FastAPI) -> Iterator[Session]:
    with Session(app.state.engine) as db_session:
        yield db_session


@pytest.fixture
def user(session: Session, settings: Settings) -> User:
    return get_or_create_single_user(session, settings)
