import json
import sqlite3
from datetime import UTC, datetime
from pathlib import Path

from sqlmodel import Session, select

from kuru.db.migrate import upgrade
from kuru.db.session import build_engine
from kuru.models import DeckConfig

NOW = "2026-10-14 10:00:00"


def _preset(db: sqlite3.Connection, anki_id: int | None, new_per_day: int) -> int:
    cursor = db.execute(
        "INSERT INTO deck_config (user_id, name, desired_retention, maximum_interval,"
        " fsrs_weights, learning_steps, relearning_steps, enable_fuzz, new_per_day,"
        " reviews_per_day, new_card_order, bury_new, bury_reviews, bury_interday_learning,"
        " autoplay_audio, show_answer_timer, anki_raw, anki_id, anki_mod, anki_usn, updated_at)"
        " VALUES (1, 'Default', 0.9, 36500, NULL, ?, ?, 1, ?, 200, 'sequential', 0, 0, 0, 1, 0,"
        " NULL, ?, NULL, NULL, ?)",
        (json.dumps([1.0, 10.0]), json.dumps([10.0]), new_per_day, anki_id, NOW),
    )
    assert cursor.lastrowid is not None
    return cursor.lastrowid


def test_duplicate_default_presets_are_merged(tmp_path: Path) -> None:
    url = f"sqlite:///{tmp_path / 'kuru.db'}"
    upgrade(url, "0001")
    db = sqlite3.connect(tmp_path / "kuru.db")
    db.execute(
        "INSERT INTO user (id, name, timezone, day_rollover_hour, created_at, updated_at)"
        " VALUES (1, 'Learner', 'UTC', 4, ?, ?)",
        (NOW, NOW),
    )
    kuru_default = _preset(db, anki_id=None, new_per_day=20)
    duplicate = _preset(db, anki_id=1, new_per_day=12)
    db.execute(
        "INSERT INTO deck (user_id, name, description, config_id, is_filtered, updated_at)"
        " VALUES (1, 'Kana', '', ?, 0, ?)",
        (duplicate, NOW),
    )
    db.commit()
    db.close()

    upgrade(url)

    db = sqlite3.connect(tmp_path / "kuru.db")
    presets = db.execute("SELECT id, anki_id, new_per_day FROM deck_config").fetchall()
    assert presets == [(kuru_default, 1, 12)]  # one Default, carrying the imported Anki values
    assert db.execute("SELECT config_id FROM deck").fetchall() == [(kuru_default,)]

    # The timestamps written by the migration read back through the ORM column type.
    with Session(build_engine(url)) as session:
        preset = session.exec(select(DeckConfig)).one()
        assert preset.updated_at.tzinfo is not None
        assert preset.updated_at > datetime(2026, 10, 14, 10, tzinfo=UTC)


def test_merge_is_a_no_op_without_duplicates(tmp_path: Path) -> None:
    url = f"sqlite:///{tmp_path / 'kuru.db'}"
    upgrade(url, "0001")
    db = sqlite3.connect(tmp_path / "kuru.db")
    db.execute(
        "INSERT INTO user (id, name, timezone, day_rollover_hour, created_at, updated_at)"
        " VALUES (1, 'Learner', 'UTC', 4, ?, ?)",
        (NOW, NOW),
    )
    only = _preset(db, anki_id=None, new_per_day=20)
    other = _preset(db, anki_id=5, new_per_day=7)
    db.commit()
    db.close()
    upgrade(url)
    db = sqlite3.connect(tmp_path / "kuru.db")
    assert db.execute("SELECT id, anki_id FROM deck_config ORDER BY id").fetchall() == [
        (only, None),
        (other, 5),
    ]
