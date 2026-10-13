"""Building the daily study queue and deck counts.

The queue follows Anki's v3 scheduler in spirit:

* a *study day* starts at the user's rollover hour in their timezone;
* learning cards due before the end of the day are always shown;
* review cards due today are limited by the preset's ``reviews_per_day`` minus reviews done today;
* new cards are limited by ``new_per_day`` minus cards introduced today, in position or (stable
  per day) random order;
* suspended and buried cards are excluded; siblings can be buried for the rest of the day.

Limits are taken from the preset of the deck being studied, and include its sub-decks.
"""

from __future__ import annotations

import random
from collections import defaultdict
from collections.abc import Iterable, Sequence
from dataclasses import dataclass, field
from datetime import datetime

from sqlmodel import Session, col, func, or_, select

from kuru.core.time import day_start, next_day_start, study_day
from kuru.models import Card, CardState, Deck, DeckConfig, NewCardOrder, ReviewKind, ReviewLog, User
from kuru.services.presets import preset_for_deck


@dataclass(frozen=True, slots=True)
class DayContext:
    """Boundaries of the current study day."""

    now: datetime
    start: datetime
    end: datetime
    day_number: int

    @classmethod
    def for_user(cls, user: User, now: datetime) -> DayContext:
        day = study_day(now, user.timezone, user.day_rollover_hour)
        return cls(
            now=now,
            start=day_start(day, user.timezone, user.day_rollover_hour),
            end=next_day_start(now, user.timezone, user.day_rollover_hour),
            day_number=day.toordinal(),
        )


@dataclass(slots=True)
class StudiedToday:
    """What was already studied in the current study day."""

    new_cards: set[int] = field(default_factory=set)
    reviews: int = 0
    notes: set[int] = field(default_factory=set)


@dataclass(slots=True)
class StudyQueue:
    """Cards to study now, grouped by queue."""

    learning: list[Card]
    review: list[Card]
    new: list[Card]
    new_remaining: int
    review_remaining: int

    @property
    def cards(self) -> list[Card]:
        return [*self.learning, *self.review, *self.new]


@dataclass(slots=True)
class DeckCounts:
    new: int = 0
    learning: int = 0
    review: int = 0
    total: int = 0


@dataclass(slots=True)
class DeckNode:
    deck: Deck
    counts: DeckCounts
    children: list[DeckNode] = field(default_factory=list)


def subtree_ids(decks: Iterable[Deck], root: Deck) -> list[int]:
    """Ids of ``root`` and all of its descendants."""
    prefix = root.name + "::"
    return [
        d.id for d in decks if d.id is not None and (d.id == root.id or d.name.startswith(prefix))
    ]


def _is_new_card_review(log: ReviewLog) -> bool:
    if log.memory_before is not None:
        return bool(log.memory_before.get("state") == CardState.NEW)
    # Imported Anki entry: the first learning step of a new card has no previous interval.
    return log.kind == ReviewKind.LEARN and not log.last_interval


def studied_today(
    session: Session, user: User, deck_ids: Sequence[int], ctx: DayContext
) -> StudiedToday:
    """Count new cards introduced and reviews done today within ``deck_ids``."""
    result = StudiedToday()
    rows = session.exec(
        select(ReviewLog, Card.note_id)
        .join(Card, col(Card.id) == ReviewLog.card_id)
        .where(
            ReviewLog.user_id == user.id,
            col(ReviewLog.reviewed_at) >= ctx.start,
            col(Card.deck_id).in_(deck_ids),
            col(ReviewLog.rating) > 0,
        )
    )
    for log, note_id in rows:
        result.notes.add(note_id)
        if _is_new_card_review(log):
            result.new_cards.add(log.card_id)
        elif log.kind == ReviewKind.REVIEW:
            result.reviews += 1
    return result


def _available(
    session: Session, user: User, deck_ids: Sequence[int], ctx: DayContext
) -> list[Card]:
    return list(
        session.exec(
            select(Card).where(
                Card.user_id == user.id,
                col(Card.deck_id).in_(deck_ids),
                col(Card.suspended).is_(False),
                or_(col(Card.buried_until).is_(None), col(Card.buried_until) <= ctx.now),
                or_(Card.state == CardState.NEW, col(Card.due) < ctx.end),
            )
        )
    )


def build_queue(
    session: Session, user: User, deck: Deck, now: datetime, *, include_all_new: bool = False
) -> StudyQueue:
    """Build today's queue for ``deck`` and its sub-decks."""
    ctx = DayContext.for_user(user, now)
    all_decks = session.exec(select(Deck).where(Deck.user_id == user.id)).all()
    deck_ids = subtree_ids(all_decks, deck)
    preset = preset_for_deck(session, user, deck)
    done = studied_today(session, user, deck_ids, ctx)
    cards = _available(session, user, deck_ids, ctx)

    learning = sorted(
        (c for c in cards if c.state in (CardState.LEARNING, CardState.RELEARNING)),
        key=lambda c: (c.due or now, c.id or 0),
    )

    review_remaining = max(0, preset.reviews_per_day - done.reviews)
    seen_notes = set(done.notes) if preset.bury_reviews else set()
    review: list[Card] = []
    for card in sorted(
        (c for c in cards if c.state == CardState.REVIEW), key=lambda c: (c.due or now, c.id or 0)
    ):
        if len(review) >= review_remaining:
            break
        if preset.bury_reviews:
            if card.note_id in seen_notes:
                continue
            seen_notes.add(card.note_id)
        review.append(card)

    new_remaining = max(0, preset.new_per_day - len(done.new_cards))
    new_candidates = _order_new(
        [c for c in cards if c.state == CardState.NEW], preset, ctx.day_number
    )
    seen_new_notes = set(done.notes) | {c.note_id for c in review} if preset.bury_new else set()
    new: list[Card] = []
    for card in new_candidates:
        if not include_all_new and len(new) >= new_remaining:
            break
        if preset.bury_new:
            if card.note_id in seen_new_notes:
                continue
            seen_new_notes.add(card.note_id)
        new.append(card)

    return StudyQueue(
        learning=learning,
        review=review,
        new=new,
        new_remaining=new_remaining,
        review_remaining=review_remaining,
    )


def _order_new(cards: list[Card], preset: DeckConfig, day_number: int) -> list[Card]:
    ordered = sorted(cards, key=lambda c: (c.position, c.id or 0))
    if preset.new_card_order == NewCardOrder.RANDOM:
        # Stable for the whole day so the queue does not jump around between requests.
        random.Random(day_number * 1_000_003 + (preset.id or 0)).shuffle(ordered)  # noqa: S311
    return ordered


def deck_tree(session: Session, user: User, now: datetime) -> list[DeckNode]:
    """All decks as a tree with today's due counts (limits applied per node)."""
    ctx = DayContext.for_user(user, now)
    decks = sorted(
        session.exec(select(Deck).where(Deck.user_id == user.id)).all(), key=lambda d: d.name
    )
    raw: dict[int, DeckCounts] = defaultdict(DeckCounts)
    for card in _available(session, user, [d.id for d in decks if d.id is not None], ctx):
        counts = raw[card.deck_id]
        if card.state == CardState.NEW:
            counts.new += 1
        elif card.state == CardState.REVIEW:
            counts.review += 1
        else:
            counts.learning += 1
    totals: dict[int, int] = defaultdict(int)
    totals.update(
        session.exec(
            select(Card.deck_id, func.count())
            .where(Card.user_id == user.id)
            .group_by(col(Card.deck_id))
        ).all()
    )

    nodes: dict[str, DeckNode] = {}
    roots: list[DeckNode] = []
    for deck in decks:
        ids = subtree_ids(decks, deck)
        preset = preset_for_deck(session, user, deck)
        done = studied_today(session, user, ids, ctx)
        counts = DeckCounts(
            new=min(sum(raw[i].new for i in ids), max(0, preset.new_per_day - len(done.new_cards))),
            learning=sum(raw[i].learning for i in ids),
            review=min(
                sum(raw[i].review for i in ids), max(0, preset.reviews_per_day - done.reviews)
            ),
            total=sum(totals[i] for i in ids),
        )
        node = DeckNode(deck=deck, counts=counts)
        nodes[deck.name] = node
        parent_name = deck.name.rpartition("::")[0]
        if parent_name and parent_name in nodes:
            nodes[parent_name].children.append(node)
        else:
            roots.append(node)
    return roots
