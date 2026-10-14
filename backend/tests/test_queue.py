from datetime import timedelta
from uuid import uuid4

from fastapi.testclient import TestClient
from sqlmodel import Session, col, select

from kuru.core.time import utcnow
from kuru.models import CardState, Deck, DeckConfig, NewCardOrder, ReviewLog, User
from kuru.services.card_actions import CardAction, apply_action
from kuru.services.presets import default_preset
from kuru.services.queue import build_queue, deck_tree
from kuru.services.reviews import ReviewSubmission, record_reviews
from tests.factories import add_sibling, get_or_create_deck, make_card, make_review_card


def _preset(session: Session, user: User, **values: object) -> DeckConfig:
    preset = default_preset(session, user)
    for key, value in values.items():
        setattr(preset, key, value)
    session.add(preset)
    session.commit()
    return preset


def test_new_card_limit_counts_todays_introductions(session: Session, user: User) -> None:
    _preset(session, user, new_per_day=2)
    cards = [make_card(session, user) for _ in range(5)]
    deck = get_or_create_deck(session, user)
    queue = build_queue(session, user, deck, utcnow())
    assert [c.id for c in queue.new] == [c.id for c in cards[:2]]

    assert cards[0].id is not None
    record_reviews(
        session,
        user,
        [ReviewSubmission(id=str(uuid4()), card_id=cards[0].id, rating=3, reviewed_at=utcnow())],
    )
    queue = build_queue(session, user, deck, utcnow())
    assert queue.new_remaining == 1
    assert len(queue.new) == 1
    assert [c.id for c in queue.learning] == [cards[0].id]


def test_review_queue_filters(session: Session, user: User) -> None:
    now = utcnow()
    due = make_review_card(session, user, due=now - timedelta(hours=1))
    make_review_card(session, user, due=now + timedelta(days=3))
    suspended = make_review_card(session, user, due=now - timedelta(days=1))
    buried = make_review_card(session, user, due=now - timedelta(days=1))
    assert suspended.id is not None and buried.id is not None
    apply_action(session, user, [suspended.id], CardAction.SUSPEND)
    apply_action(session, user, [buried.id], CardAction.BURY)

    queue = build_queue(session, user, get_or_create_deck(session, user), now)
    assert [c.id for c in queue.review] == [due.id]


def test_review_limit(session: Session, user: User) -> None:
    _preset(session, user, reviews_per_day=2)
    now = utcnow()
    for hours in range(4):
        make_review_card(session, user, due=now - timedelta(hours=hours + 1))
    queue = build_queue(session, user, get_or_create_deck(session, user), now)
    assert len(queue.review) == 2
    # Most overdue first.
    assert queue.review[0].due is not None and queue.review[1].due is not None
    assert queue.review[0].due < queue.review[1].due


def test_bury_new_siblings(session: Session, user: User) -> None:
    _preset(session, user, bury_new=True)
    card = make_card(session, user)
    add_sibling(session, user, card)
    queue = build_queue(session, user, get_or_create_deck(session, user), utcnow())
    assert [c.id for c in queue.new] == [card.id]


def test_random_new_order_is_stable(session: Session, user: User) -> None:
    _preset(session, user, new_card_order=NewCardOrder.RANDOM, new_per_day=50)
    for _ in range(20):
        make_card(session, user)
    deck = get_or_create_deck(session, user)
    first = [c.id for c in build_queue(session, user, deck, utcnow()).new]
    second = [c.id for c in build_queue(session, user, deck, utcnow()).new]
    assert first == second
    assert first != sorted(first)  # type: ignore[type-var]


def test_deck_tree_aggregates_subdecks(session: Session, user: User) -> None:
    now = utcnow()
    make_card(session, user, deck_name="Lang::JP")
    make_review_card(session, user, due=now - timedelta(hours=1), deck_name="Lang::JP")
    make_card(session, user, deck_name="Lang::DE")
    get_or_create_deck(session, user, "Lang")
    session.commit()
    roots = deck_tree(session, user, now)
    lang = next(node for node in roots if node.deck.name == "Lang")
    assert {child.deck.name for child in lang.children} == {"Lang::JP", "Lang::DE"}
    assert (lang.counts.new, lang.counts.review, lang.counts.total) == (2, 1, 3)


def test_forget_resets_and_logs(session: Session, user: User) -> None:
    card = make_review_card(session, user, due=utcnow())
    assert card.id is not None
    [reset] = apply_action(session, user, [card.id], CardAction.FORGET)
    assert reset.state == CardState.NEW and reset.stability is None and reset.reps == 0
    log = session.exec(select(ReviewLog).where(ReviewLog.card_id == card.id)).one()
    assert log.rating == 0 and log.interval == 0


def test_deck_api(client: TestClient, session: Session, user: User) -> None:
    created = client.post("/api/decks", json={"name": "Languages :: Japanese"}).json()
    assert created["name"] == "Languages::Japanese"
    assert created["short_name"] == "Japanese"
    tree = client.get("/api/decks").json()
    assert [d["name"] for d in tree] == ["Languages"]
    assert tree[0]["children"][0]["id"] == created["id"]
    assert client.post("/api/decks", json={"name": "Languages"}).status_code == 409

    parent_id = tree[0]["id"]
    renamed = client.patch(f"/api/decks/{parent_id}", json={"name": "Lang"}).json()
    assert renamed["children"][0]["name"] == "Lang::Japanese"

    card = make_card(session, user, deck_name="Lang::Japanese")
    queue = client.get(f"/api/decks/{parent_id}/due").json()
    assert [c["id"] for c in queue["new"]] == [card.id]
    assert queue["new"][0]["fields"] == ["Q", "A"]
    assert queue["note_types"][0]["templates"][0]["qfmt"] == "{{Front}}"

    assert client.delete(f"/api/decks/{parent_id}").status_code == 204
    assert session.exec(select(Deck).where(col(Deck.name).startswith("Lang"))).all() == []


def test_preset_api(client: TestClient) -> None:
    presets = client.get("/api/presets").json()
    assert len(presets) == 1 and presets[0]["is_default"]
    default_id = presets[0]["id"]
    assert len(presets[0]["fsrs_weights"]) == 21

    created = client.post(
        "/api/presets", json={"name": "Hard mode", "copy_from": default_id, "new_per_day": 5}
    ).json()
    assert created["new_per_day"] == 5
    assert created["weights_are_default"]

    patched = client.patch(
        f"/api/presets/{created['id']}",
        json={"desired_retention": 0.95, "learning_steps": [1, 5, 30]},
    ).json()
    assert patched["desired_retention"] == 0.95
    assert patched["learning_steps"] == [1, 5, 30]
    assert (
        client.patch(f"/api/presets/{created['id']}", json={"fsrs_weights": [1, 2]}).status_code
        == 422
    )
    assert (
        client.patch(f"/api/presets/{created['id']}", json={"learning_steps": [-1]}).status_code
        == 422
    )

    deck = client.post("/api/decks", json={"name": "X", "config_id": created["id"]}).json()
    assert deck["config_id"] == created["id"]
    assert client.delete(f"/api/presets/{default_id}").status_code == 409
    assert client.delete(f"/api/presets/{created['id']}").status_code == 204
    assert client.get(f"/api/decks/{deck['id']}").json()["config_id"] == default_id

    response = client.post(f"/api/presets/{default_id}/optimize")
    assert response.status_code in (422, 501)  # too few reviews / optimizer extra missing


def test_card_actions_api(client: TestClient, session: Session, user: User) -> None:
    card = make_card(session, user)
    response = client.post("/api/cards/actions", json={"card_ids": [card.id], "action": "suspend"})
    assert response.json()[0]["suspended"] is True
    other = client.post("/api/decks", json={"name": "Other"}).json()
    moved = client.post(
        "/api/cards/actions",
        json={"card_ids": [card.id], "action": "move", "deck_id": other["id"]},
    )
    assert moved.status_code == 200
    session.refresh(card)
    assert card.deck_id == other["id"]
    bad = client.post("/api/cards/actions", json={"card_ids": [card.id], "action": "move"})
    assert bad.status_code == 422


def test_stats_and_history(client: TestClient, session: Session, user: User) -> None:
    now = utcnow()
    card = make_review_card(session, user, due=now - timedelta(days=1))
    make_card(session, user)
    assert card.id is not None
    for minutes, rating in ((30, 3), (10, 1)):
        record_reviews(
            session,
            user,
            [
                ReviewSubmission(
                    id=str(uuid4()),
                    card_id=card.id,
                    rating=rating,
                    reviewed_at=now - timedelta(minutes=minutes),
                )
            ],
        )
    stats = client.get("/api/stats").json()
    assert stats["today"]["reviews"] == 2
    assert stats["today"]["again"] == 1
    assert stats["retention"] == 0.5
    assert stats["streak"] == 1
    assert stats["card_counts"]["new"] == 1
    assert len(stats["activity"]) == 30 and len(stats["forecast"]) == 30
    history = client.get(f"/api/cards/{card.id}/history").json()
    assert [h["rating"] for h in history] == [1, 3]


def test_delete_deck_removes_cards_history_and_orphaned_notes(
    client: TestClient, session: Session, user: User
) -> None:
    from kuru.models import Card, Note, ReviewLog

    only_here = make_card(session, user, deck_name="Kana::Hiragana")
    shared = make_card(session, user, deck_name="Kana")
    other = make_card(session, user, deck_name="Vocab")
    assert only_here.id is not None and shared.id is not None and user.id is not None
    # A second card of `shared`'s note lives in another deck: that note must survive.
    sibling = Card(user_id=user.id, note_id=shared.note_id, deck_id=other.deck_id, ord=1)
    session.add(sibling)
    session.commit()
    record_reviews(
        session,
        user,
        [ReviewSubmission(id=str(uuid4()), card_id=only_here.id, rating=3, reviewed_at=utcnow())],
    )
    kana = session.exec(select(Deck).where(Deck.name == "Kana")).one()
    orphan_note, shared_note = only_here.note_id, shared.note_id
    survivors = {other.id, sibling.id}

    assert client.delete(f"/api/decks/{kana.id}").status_code == 204

    session.expire_all()
    assert {d.name for d in session.exec(select(Deck))} == {"Vocab"}
    assert {c.id for c in session.exec(select(Card))} == survivors
    assert session.get(Note, orphan_note) is None  # orphaned note removed
    assert session.get(Note, shared_note) is not None  # still has a card elsewhere
    assert session.exec(select(ReviewLog)).all() == []  # history of deleted cards removed
