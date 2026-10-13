from datetime import UTC, date, datetime

from kuru.core.time import day_start, next_day_start, study_day


def test_study_day_respects_rollover() -> None:
    # 02:00 in Vienna (CEST, UTC+2) still belongs to the previous study day with a 04:00 rollover.
    moment = datetime(2026, 6, 2, 0, 0, tzinfo=UTC)
    assert study_day(moment, "Europe/Vienna", 4) == date(2026, 6, 1)
    assert study_day(moment, "Europe/Vienna", 0) == date(2026, 6, 2)


def test_day_start_and_next_day() -> None:
    start = day_start(date(2026, 6, 1), "Europe/Vienna", 4)
    assert start == datetime(2026, 6, 1, 2, 0, tzinfo=UTC)
    assert next_day_start(datetime(2026, 6, 1, 12, tzinfo=UTC), "UTC", 4) == datetime(
        2026, 6, 2, 4, tzinfo=UTC
    )
