from datetime import UTC, datetime, timedelta
from uuid import uuid4

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from kuru.models import CardState, ReviewLog, User
from kuru.services.reviews import ReviewSubmission, record_reviews, undo_review
from tests.factories import make_card

T0 = datetime(2026, 3, 1, 9, tzinfo=UTC)


def sub(card_id: int, rating: int, at: datetime) -> ReviewSubmission:
    return ReviewSubmission(id=str(uuid4()), card_id=card_id, rating=rating, reviewed_at=at)


def test_record_is_idempotent(session: Session, user: User) -> None:
    card = make_card(session, user)
    assert card.id is not None
    review = sub(card.id, 3, T0)
    first = record_reviews(session, user, [review])
    second = record_reviews(session, user, [review])
    assert first.accepted == [review.id]
    assert second.duplicates == [review.id]
    assert len(session.exec(select(ReviewLog)).all()) == 1
    session.refresh(card)
    assert card.reps == 1


def test_out_of_order_reviews_merge_chronologically(session: Session, user: User) -> None:
    a = make_card(session, user)
    b = make_card(session, user)
    assert a.id is not None and b.id is not None
    times = [T0, T0 + timedelta(minutes=10), T0 + timedelta(days=1)]
    ratings = [3, 3, 1]

    # Card A receives reviews in order.
    record_reviews(session, user, [sub(a.id, r, t) for r, t in zip(ratings, times, strict=True)])
    # Card B receives the middle review late (as from a second, offline device).
    record_reviews(session, user, [sub(b.id, ratings[0], times[0])])
    record_reviews(session, user, [sub(b.id, ratings[2], times[2])])
    record_reviews(session, user, [sub(b.id, ratings[1], times[1])])

    session.refresh(a)
    session.refresh(b)
    for attr in ("state", "step", "stability", "difficulty", "reps", "lapses", "last_review"):
        assert getattr(a, attr) == getattr(b, attr), attr
    assert a.due is not None and b.due is not None
    assert abs((a.due - b.due).total_seconds()) < 86400 * 2  # fuzz seeds may differ by card


def test_undo_restores_previous_state(session: Session, user: User) -> None:
    card = make_card(session, user)
    assert card.id is not None
    record_reviews(session, user, [sub(card.id, 3, T0)])
    session.refresh(card)
    snapshot = (card.state, card.stability, card.due, card.reps)
    second = sub(card.id, 1, T0 + timedelta(minutes=10))
    record_reviews(session, user, [second])
    undone = undo_review(session, user, second.id)
    assert undone is not None
    assert (undone.state, undone.stability, undone.due, undone.reps) == snapshot


def test_undo_middle_review_rebuilds(session: Session, user: User) -> None:
    card = make_card(session, user)
    assert card.id is not None
    reviews = [sub(card.id, 3, T0 + timedelta(minutes=10 * i)) for i in range(3)]
    record_reviews(session, user, reviews)
    undo_review(session, user, reviews[1].id)

    reference = make_card(session, user)
    assert reference.id is not None
    record_reviews(session, user, [sub(reference.id, 3, reviews[i].reviewed_at) for i in (0, 2)])
    session.refresh(card)
    session.refresh(reference)
    assert (card.state, card.step, card.stability, card.reps) == (
        reference.state,
        reference.step,
        reference.stability,
        reference.reps,
    )


def test_unknown_and_invalid_reviews_are_rejected(session: Session, user: User) -> None:
    card = make_card(session, user)
    assert card.id is not None
    bad_rating = sub(card.id, 5, T0)
    unknown = sub(9999, 3, T0)
    result = record_reviews(session, user, [bad_rating, unknown])
    assert set(result.rejected) == {bad_rating.id, unknown.id}


def test_answer_and_preview_endpoints(client: TestClient, session: Session, user: User) -> None:
    card = make_card(session, user)
    preview = client.get(f"/api/cards/{card.id}/preview").json()
    assert preview["again"]["interval_seconds"] < preview["easy"]["interval_seconds"]
    assert preview["retrievability"] is None

    response = client.post(f"/api/cards/{card.id}/answer", json={"rating": 4})
    assert response.status_code == 200
    body = response.json()
    assert body["card"]["state"] == CardState.REVIEW
    assert body["duplicate"] is False

    assert client.delete(f"/api/reviews/{body['review_id']}").json()["state"] == CardState.NEW
    assert client.get("/api/cards/424242/preview").status_code == 404
