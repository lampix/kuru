from datetime import timedelta
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from kuru.core.config import Settings
from kuru.core.time import from_epoch_s
from kuru.models import (
    Card,
    CardState,
    Deck,
    DeckConfig,
    MediaFile,
    NewCardOrder,
    Note,
    NoteType,
    NoteTypeKind,
    ReviewLog,
    User,
)
from kuru.services.importer import AnkiImporter, InvalidPackageError, media_path, open_package
from kuru.services.importer.package import PackageVersion
from kuru.services.reviews import ReviewSubmission, record_reviews
from tests import anki_fixtures as fx


def run_import(session: Session, user: User, settings: Settings, package: Path) -> AnkiImporter:
    importer = AnkiImporter(session, user, settings.media_dir)
    with open_package(package, settings.upload_dir / "work") as pkg:
        importer.run(pkg)
    return importer


def card_by_anki(session: Session, anki_id: int) -> Card:
    card = session.exec(select(Card).where(Card.anki_id == anki_id)).one()
    return card


@pytest.fixture(params=[False, True], ids=["legacy-anki21", "latest-anki21b"])
def package(request: pytest.FixtureRequest, tmp_path: Path) -> Path:
    return fx.build_package(tmp_path / "deck.apkg", latest=request.param)


def test_package_detection(tmp_path: Path) -> None:
    legacy = fx.build_package(tmp_path / "a.apkg", latest=False)
    latest = fx.build_package(tmp_path / "b.apkg", latest=True)
    with open_package(legacy, tmp_path / "w1") as pkg:
        assert pkg.version == PackageVersion.LEGACY_2
        assert {m.filename for m in pkg.media} == set(fx.MEDIA)
    with open_package(latest, tmp_path / "w2") as pkg:
        assert pkg.version == PackageVersion.LATEST
        assert {m.filename for m in pkg.media} == set(fx.MEDIA)


def test_invalid_package(tmp_path: Path) -> None:
    bogus = tmp_path / "bogus.apkg"
    bogus.write_bytes(b"not a zip")
    with pytest.raises(InvalidPackageError), open_package(bogus, tmp_path / "w"):
        pass


def test_import_structure(session: Session, user: User, settings: Settings, package: Path) -> None:
    importer = run_import(session, user, settings, package)
    stats = importer.stats
    assert stats.fsrs_enabled_in_anki
    assert stats.notes_added == len(fx.NOTES)
    assert stats.cards_added == len(fx.CARDS)
    assert stats.reviews_added == len(fx.REVLOG)
    assert stats.media_files == len(fx.MEDIA)

    deck_names = set(session.exec(select(Deck.name)).all())
    assert {"Japanese", "Japanese::Vocab"} <= deck_names
    assert "Cram" not in deck_names  # filtered decks are dissolved into home decks

    preset = session.exec(select(DeckConfig).where(DeckConfig.anki_id == fx.PRESET_ID)).one()
    assert preset.name == "Japanese"
    assert preset.new_per_day == 15
    assert preset.reviews_per_day == 150
    assert preset.maximum_interval == 3650
    assert preset.desired_retention == 0.85  # float32 artefacts are rounded away
    assert preset.learning_steps == [1.0, 10.0]
    assert preset.bury_new is True
    assert preset.autoplay_audio is False
    assert preset.new_card_order == NewCardOrder.SEQUENTIAL
    assert preset.fsrs_weights is not None and len(preset.fsrs_weights) == 19

    vocab = session.exec(select(Deck).where(Deck.name == "Japanese::Vocab")).one()
    assert vocab.config_id == preset.id
    assert vocab.description == "Core words"

    cloze = session.exec(select(NoteType).where(NoteType.name == "Cloze")).one()
    assert cloze.kind == NoteTypeKind.CLOZE
    assert cloze.templates[0]["qfmt"] == "{{cloze:Text}}"
    assert [f["name"] for f in cloze.fields] == ["Text", "Back Extra"]

    note = session.exec(select(Note).where(Note.guid == "guidA")).one()
    assert note.fields == ["犬", "dog [sound:sound.mp3]"]
    assert note.tags == ["vocab", "jp"]
    assert user.day_rollover_hour == 5


def test_import_scheduling_state(
    session: Session, user: User, settings: Settings, package: Path
) -> None:
    run_import(session, user, settings, package)
    today = from_epoch_s(fx.CRT) + timedelta(days=fx.NOW_DAYS)

    new = card_by_anki(session, 1001)
    assert new.state == CardState.NEW and new.position == 7 and new.due is None

    learning = card_by_anki(session, 1002)
    assert learning.state == CardState.LEARNING
    assert learning.due == from_epoch_s(fx.LEARN_DUE)
    assert learning.step == 1

    with_memory = card_by_anki(session, 1003)
    assert with_memory.state == CardState.REVIEW
    assert with_memory.due == today + timedelta(days=3)
    assert (with_memory.stability, with_memory.difficulty) == (12.5, 4.2)
    assert with_memory.last_review == from_epoch_s(fx.CRT + (fx.NOW_DAYS - 7) * fx.DAY)

    sm2 = card_by_anki(session, 1004)
    assert sm2.due == today
    assert sm2.stability is not None and sm2.stability > 1
    assert sm2.difficulty is not None and 1 <= sm2.difficulty <= 10
    assert sm2.reps == 3

    assert card_by_anki(session, 1006).suspended is True
    in_filtered = card_by_anki(session, 1007)
    vocab = session.exec(select(Deck).where(Deck.name == "Japanese::Vocab")).one()
    assert in_filtered.deck_id == vocab.id
    assert in_filtered.due == today + timedelta(days=1)


def test_media_is_content_addressed(
    session: Session, user: User, settings: Settings, package: Path
) -> None:
    run_import(session, user, settings, package)
    media = session.exec(select(MediaFile).where(MediaFile.filename == "sound.mp3")).one()
    assert media.mime_type == "audio/mpeg"
    assert media_path(settings.media_dir, media.sha256).read_bytes() == fx.MEDIA["sound.mp3"]


def test_reimport_is_idempotent(
    session: Session, user: User, settings: Settings, package: Path
) -> None:
    run_import(session, user, settings, package)
    second = run_import(session, user, settings, package).stats
    assert second.notes_added == 0 and second.notes_updated == len(fx.NOTES)
    assert second.cards_added == 0
    assert second.reviews_added == 0
    assert len(session.exec(select(Card)).all()) == len(fx.CARDS)
    assert len(session.exec(select(ReviewLog)).all()) == len(fx.REVLOG)


def test_reimport_keeps_kuru_progress(
    session: Session, user: User, settings: Settings, package: Path
) -> None:
    run_import(session, user, settings, package)
    card = card_by_anki(session, 1003)
    assert card.id is not None and card.due is not None
    record_reviews(
        session, user, [ReviewSubmission(id="k1", card_id=card.id, rating=3, reviewed_at=card.due)]
    )
    session.refresh(card)
    progressed = (card.reps, card.due, card.stability)
    stats = run_import(session, user, settings, package).stats
    assert stats.cards_skipped == 1
    session.refresh(card)
    assert (card.reps, card.due, card.stability) == progressed


def test_upload_endpoint(client: TestClient, tmp_path: Path) -> None:
    package = fx.build_package(tmp_path / "upload.apkg", latest=True)
    with package.open("rb") as handle:
        response = client.post(
            "/api/import", files={"file": ("upload.apkg", handle, "application/zip")}
        )
    assert response.status_code == 202
    job_id = response.json()["id"]
    # TestClient runs background tasks before returning.
    job = client.get(f"/api/import/status/{job_id}").json()
    assert job["status"] == "completed", job
    assert job["stats"]["cards_added"] == len(fx.CARDS)
    assert client.get("/api/import/jobs").json()[0]["id"] == job_id


def test_upload_rejects_wrong_type_and_bad_archives(client: TestClient) -> None:
    bad_type = client.post("/api/import", files={"file": ("deck.txt", b"x", "text/plain")})
    assert bad_type.status_code == 415
    response = client.post("/api/import", files={"file": ("deck.apkg", b"junk", "x")})
    job = client.get(f"/api/import/status/{response.json()['id']}").json()
    assert job["status"] == "failed"
    assert "valid" in job["message"]
