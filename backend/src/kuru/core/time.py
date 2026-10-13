"""Time helpers. All datetimes inside Kuru are timezone-aware and in UTC."""

from __future__ import annotations

from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo


def utcnow() -> datetime:
    """Return the current time as an aware UTC datetime."""
    return datetime.now(UTC)


def from_epoch_ms(ms: int) -> datetime:
    """Convert epoch milliseconds (Anki ids, revlog timestamps) to an aware UTC datetime."""
    return datetime.fromtimestamp(ms / 1000, tz=UTC)


def from_epoch_s(seconds: int) -> datetime:
    """Convert epoch seconds to an aware UTC datetime."""
    return datetime.fromtimestamp(seconds, tz=UTC)


def to_epoch_ms(value: datetime) -> int:
    """Convert an aware datetime to epoch milliseconds."""
    return int(value.timestamp() * 1000)


def study_day(moment: datetime, tz: str, rollover_hour: int) -> date:
    """Return the *study day* a moment belongs to.

    Like Anki, a day does not start at midnight but at ``rollover_hour`` local time, so a review at
    02:00 still counts towards the previous day.
    """
    local = moment.astimezone(ZoneInfo(tz))
    return (local - timedelta(hours=rollover_hour)).date()


def day_start(day: date, tz: str, rollover_hour: int) -> datetime:
    """Return the UTC instant at which the given study day begins."""
    local = datetime.combine(day, time(hour=rollover_hour), tzinfo=ZoneInfo(tz))
    return local.astimezone(UTC)


def next_day_start(moment: datetime, tz: str, rollover_hour: int) -> datetime:
    """Return the UTC instant at which the study day following ``moment`` begins."""
    return day_start(study_day(moment, tz, rollover_hour) + timedelta(days=1), tz, rollover_hour)
