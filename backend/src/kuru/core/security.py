"""Authentication.

Authentication is abstracted behind :class:`AuthProvider` (ADR 0003). v1 ships
:class:`SingleUserAuthProvider`; a multi-user provider can be added without touching the data layer.
"""

from __future__ import annotations

import hashlib
import hmac
from typing import Protocol

from fastapi import HTTPException, Request, status
from sqlmodel import Session, select

from kuru.core.config import Settings
from kuru.models import User

SESSION_COOKIE = "kuru_session"


class AuthProvider(Protocol):
    """Resolves the user making a request."""

    def authenticate(self, request: Request, session: Session) -> User:
        """Return the authenticated user or raise ``HTTPException(401)``."""
        ...

    def login(self, secret: str, session: Session) -> tuple[User, str]:
        """Validate credentials and return the user plus an opaque session cookie value."""
        ...

    @property
    def requires_login(self) -> bool:
        """Whether clients must log in before using the API."""
        ...


def get_or_create_single_user(session: Session, settings: Settings) -> User:
    """Return the only user, creating it on first use."""
    user = session.exec(select(User).order_by(User.id)).first()  # type: ignore[arg-type]
    if user is None:
        user = User(
            timezone=settings.default_timezone, day_rollover_hour=settings.day_rollover_hour
        )
        session.add(user)
        session.commit()
        session.refresh(user)
    return user


class SingleUserAuthProvider:
    """One implicit user, optionally protected by a shared access token.

    Clients authenticate with ``Authorization: Bearer <token>`` or with the session cookie returned
    by ``POST /api/auth/login`` (needed for ``<img>``/``<audio>`` media requests).
    """

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        token = settings.access_token.get_secret_value() if settings.access_token else None
        self._token = token
        self._cookie_value = (
            hmac.new(token.encode(), b"kuru-session-v1", hashlib.sha256).hexdigest()
            if token
            else None
        )

    @property
    def requires_login(self) -> bool:
        return self._token is not None

    def _is_authorized(self, request: Request) -> bool:
        if self._token is None or self._cookie_value is None:
            return True
        header = request.headers.get("authorization", "")
        scheme, _, credentials = header.partition(" ")
        if scheme.lower() == "bearer" and hmac.compare_digest(credentials, self._token):
            return True
        cookie = request.cookies.get(SESSION_COOKIE)
        return cookie is not None and hmac.compare_digest(cookie, self._cookie_value)

    def authenticate(self, request: Request, session: Session) -> User:
        if not self._is_authorized(request):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication required",
                headers={"WWW-Authenticate": "Bearer"},
            )
        return get_or_create_single_user(session, self._settings)

    def login(self, secret: str, session: Session) -> tuple[User, str]:
        if self._token is not None and not hmac.compare_digest(secret, self._token):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
        return get_or_create_single_user(session, self._settings), self._cookie_value or ""
