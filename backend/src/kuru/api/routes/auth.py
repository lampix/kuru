"""Authentication endpoints."""

from __future__ import annotations

from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, HTTPException, Response
from pydantic import BaseModel

from kuru.api.deps import AuthProviderDep, CurrentUser, SessionDep
from kuru.core.security import SESSION_COOKIE
from kuru.core.time import utcnow

router = APIRouter(prefix="/auth", tags=["auth"])


class AuthInfo(BaseModel):
    requires_login: bool


class LoginRequest(BaseModel):
    token: str


class Me(BaseModel):
    id: int
    name: str
    timezone: str
    day_rollover_hour: int


class UserSettingsUpdate(BaseModel):
    name: str | None = None
    timezone: str | None = None
    day_rollover_hour: int | None = None


@router.get("/info")
def auth_info(auth: AuthProviderDep) -> AuthInfo:
    """Tell clients whether they need to log in."""
    return AuthInfo(requires_login=auth.requires_login)


@router.post("/login")
def login(body: LoginRequest, response: Response, session: SessionDep, auth: AuthProviderDep) -> Me:
    """Exchange the access token for an http-only session cookie."""
    user, cookie = auth.login(body.token, session)
    if cookie:
        response.set_cookie(
            SESSION_COOKIE, cookie, httponly=True, samesite="lax", max_age=60 * 60 * 24 * 365
        )
    return Me.model_validate(user, from_attributes=True)


@router.post("/logout", status_code=204)
def logout(response: Response) -> None:
    """Clear the session cookie."""
    response.delete_cookie(SESSION_COOKIE)


@router.get("/me")
def me(user: CurrentUser) -> Me:
    """Return the current user."""
    return Me.model_validate(user, from_attributes=True)


@router.patch("/me")
def update_me(body: UserSettingsUpdate, user: CurrentUser, session: SessionDep) -> Me:
    """Update profile settings such as the timezone used for day boundaries."""
    if body.timezone is not None:
        try:
            ZoneInfo(body.timezone)
        except (ZoneInfoNotFoundError, ValueError) as exc:
            raise HTTPException(422, f"Unknown timezone {body.timezone!r}") from exc
    if body.day_rollover_hour is not None and not 0 <= body.day_rollover_hour <= 23:
        raise HTTPException(422, "day_rollover_hour must be between 0 and 23")
    for key, value in body.model_dump(exclude_none=True).items():
        setattr(user, key, value)
    user.updated_at = utcnow()
    session.add(user)
    session.commit()
    session.refresh(user)
    return Me.model_validate(user, from_attributes=True)
