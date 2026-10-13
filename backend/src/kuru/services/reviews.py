"""Recording, merging and undoing reviews (see ADR 0004).

Reviews arrive from clients — possibly late, out of order, or more than once. This module keeps
card state consistent with the review log:

* **Idempotency:** reviews are keyed by a client-generated UUID; duplicates are ignored.
* **In-order reviews** (the common case) are applied incrementally to the stored card state, which
  preserves the exact memory state imported from Anki.
* **Out-of-order reviews** rebuild the card from the latest snapshot (``memory_before``) that
  precedes them, falling back to a full replay of the review log.
"""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Iterable, Sequence
from dataclasses import dataclass, field
from datetime import datetime

from sqlmodel import Session, col, select

from kuru.core.time import utcnow
from kuru.models import Card, CardState, ReviewKind, ReviewLog, User
from kuru.services.fsrs import FsrsEngine, MemoryState, ReplayEntry
from kuru.services.presets import preset_for_card


@dataclass(frozen=True, slots=True)
class ReviewSubmission:
    """A review sent by a client."""

    id: str
    card_id: int
    rating: int
    reviewed_at: datetime
    duration_ms: int | None = None


@dataclass(slots=True)
class RecordResult:
    """Outcome of :func:`record_reviews`."""

    accepted: list[str] = field(default_factory=list)
    duplicates: list[str] = field(default_factory=list)
    rejected: dict[str, str] = field(default_factory=dict)
    cards: list[Card] = field(default_factory=list)


def review_kind_for(state: CardState) -> ReviewKind:
    """Anki revlog type for a review made while the card was in ``state``."""
    match state:
        case CardState.REVIEW:
            return ReviewKind.REVIEW
        case CardState.RELEARNING:
            return ReviewKind.RELEARN
        case _:
            return ReviewKind.LEARN


def anki_interval(memory: MemoryState, reviewed_at: datetime) -> int:
    """Anki's ``ivl`` convention: positive days for review cards, negative seconds otherwise."""
    if memory.due is None:
        return 0
    seconds = int((memory.due - reviewed_at).total_seconds())
    if memory.state == CardState.REVIEW:
        return max(1, round(seconds / 86400))
    return -max(0, seconds)


def _make_log(
    user: User, card: Card, before: MemoryState, after: MemoryState, sub: ReviewSubmission
) -> ReviewLog:
    assert user.id is not None and card.id is not None
    return ReviewLog(
        id=sub.id,
        user_id=user.id,
        card_id=card.id,
        rating=sub.rating,
        reviewed_at=sub.reviewed_at,
        duration_ms=sub.duration_ms,
        kind=review_kind_for(before.state),
        interval=anki_interval(after, sub.reviewed_at),
        last_interval=(
            anki_interval(before, before.last_review) if before.last_review is not None else 0
        ),
        memory_before=before.to_dict(),
    )


def _replay_entry(log: ReviewLog) -> ReplayEntry:
    return ReplayEntry(
        rating=log.rating,
        reviewed_at=log.reviewed_at,
        kind=ReviewKind(log.kind),
        interval=log.interval,
        factor=log.factor,
    )


def _rebuild(
    session: Session,
    user: User,
    card: Card,
    engine: FsrsEngine,
    *,
    new_ids: frozenset[str] = frozenset(),
    base: MemoryState | None = None,
    full: bool = False,
) -> None:
    """Recompute ``card`` from its review log.

    The log is split into an *imported prefix* (entries without a snapshot, e.g. from Anki) and a
    *Kuru suffix* (entries with ``memory_before``). The suffix is re-applied on top of the state
    the card had after the prefix, which is the snapshot of the earliest pre-existing suffix entry
    or, failing that, ``base`` (the card state before the current batch). Anything that cannot be
    expressed this way — or ``full=True`` — falls back to replaying the entire log.
    """
    assert card.id is not None
    logs = list(
        session.exec(
            select(ReviewLog)
            .where(ReviewLog.card_id == card.id, ReviewLog.user_id == user.id)
            .order_by(col(ReviewLog.reviewed_at))
        )
    )
    start = len(logs)
    while start > 0 and logs[start - 1].memory_before is not None:
        start -= 1
    prefix, suffix = logs[:start], logs[start:]

    anchor = next((log for log in suffix if log.id not in new_ids), None)
    if anchor is not None and anchor.memory_before is not None:
        memory: MemoryState | None = MemoryState.from_dict(card.id, anchor.memory_before)
    else:
        memory = base

    mixed_prefix = any(log.memory_before is not None for log in prefix)
    if full or mixed_prefix or not suffix or memory is None:
        replayed = engine.replay(card.id, (_replay_entry(log) for log in logs))
        if not logs and base is not None:
            replayed = base
        replayed.apply_to(card)
        return

    for log in suffix:
        if log.rating == 0:
            continue
        log.memory_before = memory.to_dict()
        after = engine.review(memory, log.rating, log.reviewed_at)
        log.kind = review_kind_for(memory.state)
        log.interval = anki_interval(after, log.reviewed_at)
        session.add(log)
        memory = after
    memory.apply_to(card)


def record_reviews(
    session: Session, user: User, submissions: Iterable[ReviewSubmission]
) -> RecordResult:
    """Persist reviews and update the affected cards. Commits the session."""
    result = RecordResult()
    by_card: dict[int, list[ReviewSubmission]] = defaultdict(list)
    subs = list(submissions)
    existing = set(
        session.exec(select(ReviewLog.id).where(col(ReviewLog.id).in_([s.id for s in subs]))).all()
    )
    for sub in subs:
        if sub.id in existing:
            result.duplicates.append(sub.id)
        elif sub.rating not in (1, 2, 3, 4):
            result.rejected[sub.id] = "invalid rating"
        elif sub.reviewed_at.tzinfo is None:
            result.rejected[sub.id] = "reviewed_at must include a timezone"
        else:
            existing.add(sub.id)
            by_card[sub.card_id].append(sub)

    now = utcnow()
    for card_id, card_subs in by_card.items():
        card = session.get(Card, card_id)
        if card is None or card.user_id != user.id:
            for sub in card_subs:
                result.rejected[sub.id] = "unknown card"
            continue
        engine = FsrsEngine.for_config(preset_for_card(session, user, card))
        card_subs.sort(key=lambda s: s.reviewed_at)
        in_order = card.last_review is None or card_subs[0].reviewed_at >= card.last_review

        base = MemoryState.from_card(card)
        memory = base
        for sub in card_subs:
            after = engine.review(memory, sub.rating, sub.reviewed_at)
            session.add(_make_log(user, card, memory, after, sub))
            memory = after
            result.accepted.append(sub.id)
        if in_order:
            memory.apply_to(card)
        else:
            session.flush()
            _rebuild(
                session,
                user,
                card,
                engine,
                new_ids=frozenset(sub.id for sub in card_subs),
                base=base,
            )
        card.buried_until = None
        card.updated_at = now
        session.add(card)
        result.cards.append(card)

    session.commit()
    for card in result.cards:
        session.refresh(card)
    return result


def undo_review(session: Session, user: User, review_id: str) -> Card | None:
    """Delete a review and restore the card. Returns the card or ``None`` if not found."""
    log = session.get(ReviewLog, review_id)
    if log is None or log.user_id != user.id:
        return None
    card = session.get(Card, log.card_id)
    assert card is not None
    latest = session.exec(
        select(ReviewLog)
        .where(ReviewLog.card_id == card.id)
        .order_by(col(ReviewLog.reviewed_at).desc())
    ).first()
    assert card.id is not None
    snapshot = (
        MemoryState.from_dict(card.id, log.memory_before) if log.memory_before is not None else None
    )
    following = session.exec(
        select(ReviewLog)
        .where(ReviewLog.card_id == card.id, col(ReviewLog.reviewed_at) > log.reviewed_at)
        .order_by(col(ReviewLog.reviewed_at))
    ).first()
    if following is not None and following.memory_before is not None and snapshot is not None:
        # The next review now starts from the state before the deleted one.
        following.memory_before = log.memory_before
        session.add(following)
    session.delete(log)
    if latest is not None and latest.id == log.id and snapshot is not None:
        snapshot.apply_to(card)
    else:
        session.flush()
        engine = FsrsEngine.for_config(preset_for_card(session, user, card))
        _rebuild(session, user, card, engine, base=snapshot)
    card.updated_at = utcnow()
    session.add(card)
    session.commit()
    session.refresh(card)
    return card


def preview_card(session: Session, user: User, card: Card, now: datetime) -> dict[int, MemoryState]:
    """Return the state resulting from each rating."""
    engine = FsrsEngine.for_config(preset_for_card(session, user, card))
    return engine.preview(MemoryState.from_card(card), now)


def reschedule_cards(session: Session, user: User, cards: Sequence[Card]) -> int:
    """Recompute cards from their full review history (e.g. after new weights)."""
    count = 0
    for card in cards:
        engine = FsrsEngine.for_config(preset_for_card(session, user, card))
        _rebuild(session, user, card, engine, full=True)
        card.updated_at = utcnow()
        session.add(card)
        count += 1
    session.commit()
    return count
