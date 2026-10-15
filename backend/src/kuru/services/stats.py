"""Collection statistics: activity, retention, forecast and memory-state distributions."""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta

from sqlmodel import Session, col, func, select

from kuru.core.time import day_start, study_day
from kuru.models import Card, CardState, Deck, ReviewKind, ReviewLog, User
from kuru.services.fsrs import FsrsEngine, MemoryState
from kuru.services.presets import preset_for_deck
from kuru.services.queue import is_new_card_review, subtree_ids

STABILITY_BUCKETS = (1, 3, 7, 14, 30, 90, 180, 365, 730)  # upper bounds in days


@dataclass(slots=True)
class DayActivity:
    day: date
    reviews: int = 0
    again: int = 0
    new: int = 0
    duration_ms: int = 0


@dataclass(slots=True)
class Stats:
    today: DayActivity
    activity: list[DayActivity]
    retention: float | None
    retention_reviews: int
    forecast: list[tuple[date, int]]
    card_counts: dict[str, int]
    stability: list[tuple[str, int]]
    difficulty: list[tuple[str, int]]
    average_retrievability: float | None
    total_reviews: int
    streak: int
    extra: dict[str, int] = field(default_factory=dict)


def _bucket_label(index: int) -> str:
    low = 0 if index == 0 else STABILITY_BUCKETS[index - 1]
    if index == len(STABILITY_BUCKETS):
        return f"{STABILITY_BUCKETS[-1]}+"
    return f"{low}-{STABILITY_BUCKETS[index]}"


MAX_ACTIVITY_DAYS = 400


@dataclass(slots=True)
class Activity:
    first_day: date | None
    days: list[DayActivity]


def _scoped_card_ids(session: Session, user: User, deck: Deck | None) -> list[int | None]:
    query = select(Card.id).where(Card.user_id == user.id)
    if deck is not None:
        decks = session.exec(select(Deck).where(Deck.user_id == user.id)).all()
        query = query.where(col(Card.deck_id).in_(subtree_ids(decks, deck)))
    return list(session.exec(query))


def compute_activity(
    session: Session, user: User, start: date, end: date, deck: Deck | None = None
) -> Activity:
    """Reviews per study day from ``start`` to ``end`` (inclusive), plus the first study day."""
    tz, rollover = user.timezone, user.day_rollover_hour
    card_ids = _scoped_card_ids(session, user, deck)
    scope = (
        ReviewLog.user_id == user.id,
        col(ReviewLog.card_id).in_(card_ids),
        col(ReviewLog.rating) > 0,
    )
    days = {
        start + timedelta(days=i): DayActivity(start + timedelta(days=i))
        for i in range((end - start).days + 1)
    }
    logs = session.exec(
        select(ReviewLog).where(
            *scope,
            col(ReviewLog.reviewed_at) >= day_start(start, tz, rollover),
            col(ReviewLog.reviewed_at) < day_start(end + timedelta(days=1), tz, rollover),
        )
    )
    for log in logs:
        bucket = days.get(study_day(log.reviewed_at, tz, rollover))
        if bucket is not None:
            bucket.reviews += 1
            bucket.again += log.rating == 1
            bucket.new += is_new_card_review(log)
            bucket.duration_ms += log.duration_ms or 0
    first = session.exec(select(func.min(ReviewLog.reviewed_at)).where(*scope)).one()
    return Activity(
        first_day=study_day(first, tz, rollover) if first is not None else None,
        days=sorted(days.values(), key=lambda a: a.day),
    )


def compute_stats(
    session: Session, user: User, now: datetime, deck: Deck | None = None, days: int = 30
) -> Stats:
    """Statistics for the whole collection or a deck subtree."""
    tz, rollover = user.timezone, user.day_rollover_hour
    today = study_day(now, tz, rollover)

    card_query = select(Card).where(Card.user_id == user.id)
    decks = session.exec(select(Deck).where(Deck.user_id == user.id)).all()
    if deck is not None:
        card_query = card_query.where(col(Card.deck_id).in_(subtree_ids(decks, deck)))
    cards = list(session.exec(card_query))
    card_ids = [c.id for c in cards]

    # Activity over the last `days` study days.
    since = now - timedelta(days=days + 1)
    logs = list(
        session.exec(
            select(ReviewLog).where(
                ReviewLog.user_id == user.id,
                col(ReviewLog.card_id).in_(card_ids),
                col(ReviewLog.reviewed_at) >= since,
                col(ReviewLog.rating) > 0,
            )
        )
    )
    activity = {
        today - timedelta(days=i): DayActivity(today - timedelta(days=i)) for i in range(days)
    }
    passed = total = 0
    for log in logs:
        bucket = activity.get(study_day(log.reviewed_at, tz, rollover))
        if bucket is not None:
            bucket.reviews += 1
            bucket.again += log.rating == 1
            bucket.new += is_new_card_review(log)
            bucket.duration_ms += log.duration_ms or 0
        if log.kind == ReviewKind.REVIEW:
            total += 1
            passed += log.rating > 1

    # Streak: consecutive study days with at least one review, ending today (or yesterday).
    streak_days = {
        study_day(at, tz, rollover)
        for at in session.exec(
            select(ReviewLog.reviewed_at).where(
                ReviewLog.user_id == user.id,
                col(ReviewLog.card_id).in_(card_ids),
                col(ReviewLog.rating) > 0,
                col(ReviewLog.reviewed_at) >= now - timedelta(days=3650),
            )
        )
    }
    streak = 0
    cursor = today if today in streak_days else today - timedelta(days=1)
    while cursor in streak_days:
        streak += 1
        cursor -= timedelta(days=1)

    # Forecast and distributions.
    forecast: Counter[date] = Counter()
    counts: Counter[str] = Counter()
    stability: Counter[int] = Counter()
    difficulty: Counter[int] = Counter()
    deck_by_id = {d.id: d for d in decks}
    engines: dict[int | None, FsrsEngine] = {}
    retrievabilities: list[float] = []
    horizon = today + timedelta(days=days)
    for card in cards:
        if card.suspended:
            counts["suspended"] += 1
            continue
        state = CardState(card.state)
        counts[state.name.lower()] += 1
        if state != CardState.NEW and card.due is not None:
            due_day = max(study_day(card.due, tz, rollover), today)
            if due_day < horizon:
                forecast[due_day] += 1
        if card.stability is not None:
            index = next(
                (i for i, bound in enumerate(STABILITY_BUCKETS) if card.stability < bound),
                len(STABILITY_BUCKETS),
            )
            stability[index] += 1
        if card.difficulty is not None:
            difficulty[min(9, max(0, int(card.difficulty) - 1))] += 1
        if state == CardState.REVIEW:
            owner = deck_by_id.get(card.deck_id)
            key = owner.config_id if owner else None
            if key not in engines:
                engines[key] = FsrsEngine.for_config(
                    preset_for_deck(session, user, owner) if owner else None
                )
            r = engines[key].retrievability(MemoryState.from_card(card), now)
            if r is not None:
                retrievabilities.append(r)

    total_reviews = len(
        session.exec(
            select(ReviewLog.id).where(
                ReviewLog.user_id == user.id,
                col(ReviewLog.card_id).in_(card_ids),
                col(ReviewLog.rating) > 0,
            )
        ).all()
    )
    return Stats(
        today=activity[today],
        activity=sorted(activity.values(), key=lambda a: a.day),
        retention=passed / total if total else None,
        retention_reviews=total,
        forecast=[
            (today + timedelta(days=i), forecast[today + timedelta(days=i)]) for i in range(days)
        ],
        card_counts={
            key: counts[key] for key in ("new", "learning", "review", "relearning", "suspended")
        },
        stability=[(_bucket_label(i), stability[i]) for i in range(len(STABILITY_BUCKETS) + 1)],
        difficulty=[(str(i + 1), difficulty[i]) for i in range(10)],
        average_retrievability=(
            sum(retrievabilities) / len(retrievabilities) if retrievabilities else None
        ),
        total_reviews=total_reviews,
        streak=streak,
    )
