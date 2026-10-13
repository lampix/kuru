"""Shared FastAPI dependencies."""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends, Request
from sqlmodel import Session

from kuru.core.config import Settings
from kuru.core.security import AuthProvider
from kuru.db.session import get_session
from kuru.models import User


def get_app_settings(request: Request) -> Settings:
    """Return the settings the application was created with."""
    settings: Settings = request.app.state.settings
    return settings


SessionDep = Annotated[Session, Depends(get_session)]
SettingsDep = Annotated[Settings, Depends(get_app_settings)]


def get_auth_provider(request: Request) -> AuthProvider:
    """Return the auth provider configured on the application."""
    provider: AuthProvider = request.app.state.auth_provider
    return provider


AuthProviderDep = Annotated[AuthProvider, Depends(get_auth_provider)]


def get_current_user(request: Request, session: SessionDep, auth: AuthProviderDep) -> User:
    """Resolve the authenticated user. Every data query must be scoped to this user."""
    return auth.authenticate(request, session)


CurrentUser = Annotated[User, Depends(get_current_user)]
