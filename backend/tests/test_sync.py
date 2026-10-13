from datetime import timedelta
from pathlib import Path
from uuid import uuid4

from fastapi.testclient import TestClient
from sqlmodel import Session

from kuru.core.time import utcnow
from kuru.models import User
from tests import anki_fixtures as fx
from tests.factories import make_card


def _review(card_id: int, rating: int, minutes_ago: int) -> dict[str, object]:
    return {
        "id": str(uuid4()),
        "card_id": card_id,
        "rating": rating,
        "reviewed_at": (utcnow() - timedelta(minutes=minutes_ago)).isoformat(),
        "duration_ms": 4200,
    }


def test_push_reviews_is_idempotent(client: TestClient, session: Session, user: User) -> None:
    card = make_card(session, user)
    assert card.id is not None
    batch = {"reviews": [_review(card.id, 3, 30), _review(card.id, 3, 20)]}
    first = client.post("/api/sync/reviews", json=batch).json()
    assert len(first["accepted"]) == 2
    assert first["cards"][0]["reps"] == 2
    again = client.post("/api/sync/reviews", json=batch).json()
    assert again["accepted"] == [] and len(again["duplicates"]) == 2
    assert again["cards"][0]["reps"] == 2  # current state returned for duplicates too


def test_push_rejects_naive_timestamps(client: TestClient, session: Session, user: User) -> None:
    card = make_card(session, user)
    review = _review(card.id or 0, 3, 1)
    review["reviewed_at"] = "2026-01-01T10:00:00"
    assert client.post("/api/sync/reviews", json={"reviews": [review]}).status_code == 422


def test_pull_cards_incrementally(client: TestClient, session: Session, user: User) -> None:
    cards = [make_card(session, user) for _ in range(5)]
    meta = client.get("/api/sync/meta").json()
    assert meta["card_count"] == 5
    assert meta["presets"] and meta["decks"] and meta["note_types"]

    page = client.get("/api/sync/cards", params={"limit": 3}).json()
    assert len(page["cards"]) == 3 and page["next_after_id"] == cards[2].id
    rest = client.get("/api/sync/cards", params={"limit": 3, "after_id": page["next_after_id"]})
    assert len(rest.json()["cards"]) == 2 and rest.json()["next_after_id"] is None

    since = meta["server_time"]
    assert client.get("/api/sync/cards", params={"since": since}).json()["cards"] == []
    client.post("/api/sync/reviews", json={"reviews": [_review(cards[1].id or 0, 4, 0)]})
    changed = client.get("/api/sync/cards", params={"since": since}).json()["cards"]
    assert [c["id"] for c in changed] == [cards[1].id]

    assert client.get("/api/sync/card-ids").json()["card_ids"] == [c.id for c in cards]


def test_media_manifest_and_download(client: TestClient, tmp_path: Path) -> None:
    package = fx.build_package(tmp_path / "m.apkg", latest=True)
    with package.open("rb") as handle:
        client.post("/api/import", files={"file": ("m.apkg", handle, "application/zip")})
    manifest = {m["filename"]: m for m in client.get("/api/sync/media").json()}
    assert set(manifest) == set(fx.MEDIA)

    response = client.get("/api/media/sound.mp3")
    assert response.status_code == 200
    assert response.content == fx.MEDIA["sound.mp3"]
    assert response.headers["content-type"] == "audio/mpeg"
    etag = response.headers["etag"]
    cached = client.get("/api/media/sound.mp3", headers={"If-None-Match": etag})
    assert cached.status_code == 304
    assert client.get("/api/media/missing.png").status_code == 404


def test_recent_reviews(client: TestClient, session: Session, user: User) -> None:
    card = make_card(session, user)
    assert card.id is not None
    client.post(
        "/api/sync/reviews", json={"reviews": [_review(card.id, 3, 5), _review(card.id, 3, 1)]}
    )
    since = (utcnow() - timedelta(hours=1)).isoformat()
    reviews = client.get("/api/sync/reviews", params={"since": since}).json()
    assert [r["was_new"] for r in reviews] == [True, False]
    assert reviews[0]["kind"] == 0
