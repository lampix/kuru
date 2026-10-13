from datetime import UTC, datetime, timedelta

import pytest

from kuru.models import CardState, ReviewKind
from kuru.services.fsrs import FsrsEngine, MemoryState, ReplayEntry, SchedulingOptions
from kuru.services.fsrs.weights import normalize_weights

T0 = datetime(2026, 1, 1, 12, tzinfo=UTC)


@pytest.fixture
def engine() -> FsrsEngine:
    return FsrsEngine(SchedulingOptions(weights=normalize_weights(None)))


def test_new_card_good_enters_learning(engine: FsrsEngine) -> None:
    after = engine.review(MemoryState(card_id=1), 3, T0)
    assert after.state == CardState.LEARNING
    assert after.step == 1
    assert after.due == T0 + timedelta(minutes=10)
    assert after.reps == 1
    assert after.stability is not None and after.difficulty is not None


def test_new_card_easy_graduates(engine: FsrsEngine) -> None:
    after = engine.review(MemoryState(card_id=1), 4, T0)
    assert after.state == CardState.REVIEW
    assert after.due is not None and after.due - T0 >= timedelta(days=1)


def test_lapse_is_counted(engine: FsrsEngine) -> None:
    memory = engine.review(MemoryState(card_id=1), 4, T0)
    assert memory.due is not None
    lapsed = engine.review(memory, 1, memory.due)
    assert lapsed.state == CardState.RELEARNING
    assert lapsed.lapses == 1


def test_preview_orders_intervals(engine: FsrsEngine) -> None:
    memory = engine.review(MemoryState(card_id=7), 4, T0)
    assert memory.due is not None
    preview = engine.preview(memory, memory.due)
    dues = [preview[r].due for r in (1, 2, 3, 4)]
    assert all(d is not None for d in dues)
    assert dues == sorted(dues)  # type: ignore[type-var]


def test_review_is_deterministic(engine: FsrsEngine) -> None:
    memory = engine.review(MemoryState(card_id=5), 4, T0)
    assert memory.due is not None
    assert engine.review(memory, 3, memory.due) == engine.review(memory, 3, memory.due)


def test_replay_matches_sequential_reviews(engine: FsrsEngine) -> None:
    ratings = [3, 3, 3, 1, 3, 4]
    memory = MemoryState(card_id=9)
    entries = []
    at = T0
    for rating in ratings:
        entries.append(ReplayEntry(rating=rating, reviewed_at=at))
        memory = engine.review(memory, rating, at)
        assert memory.due is not None
        at = memory.due
    assert engine.replay(9, reversed(entries)) == memory


def test_replay_forget_resets_card(engine: FsrsEngine) -> None:
    entries = [
        ReplayEntry(rating=4, reviewed_at=T0),
        ReplayEntry(rating=0, reviewed_at=T0 + timedelta(days=1), kind=ReviewKind.MANUAL),
    ]
    memory = engine.replay(1, entries)
    assert memory.state == CardState.NEW
    assert memory.stability is None


def test_replay_skips_filtered_previews(engine: FsrsEngine) -> None:
    entries = [ReplayEntry(rating=3, reviewed_at=T0, kind=ReviewKind.FILTERED, factor=0)]
    assert engine.replay(1, entries).state == CardState.NEW


def test_retrievability(engine: FsrsEngine) -> None:
    assert engine.retrievability(MemoryState(card_id=1), T0) is None
    memory = engine.review(MemoryState(card_id=1), 4, T0)
    r_soon = engine.retrievability(memory, T0 + timedelta(days=1))
    r_late = engine.retrievability(memory, T0 + timedelta(days=60))
    assert r_soon is not None and r_late is not None
    assert 0 < r_late < r_soon <= 1


def test_rejects_naive_datetimes(engine: FsrsEngine) -> None:
    with pytest.raises(ValueError, match="timezone"):
        engine.review(MemoryState(card_id=1), 3, datetime(2026, 1, 1))


def test_memory_state_roundtrip(engine: FsrsEngine) -> None:
    memory = engine.review(MemoryState(card_id=3), 3, T0)
    assert MemoryState.from_dict(3, memory.to_dict()) == memory
