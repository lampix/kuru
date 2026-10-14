"""merge duplicated Default presets

Before 0.1.1 an import created Anki's built-in "Default" options group (anki_id = 1) as a second
preset next to Kuru's own Default (anki_id NULL, created on first sync). Merge it into Kuru's
Default: Anki's values win (they are what the user imported), decks are repointed and the
duplicate is deleted.

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-14
"""

from collections.abc import Sequence
from datetime import UTC, datetime

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

ANKI_DEFAULT_PRESET_ID = 1
COPIED = (
    "name",
    "desired_retention",
    "maximum_interval",
    "fsrs_weights",
    "learning_steps",
    "relearning_steps",
    "enable_fuzz",
    "new_per_day",
    "reviews_per_day",
    "new_card_order",
    "bury_new",
    "bury_reviews",
    "bury_interday_learning",
    "autoplay_audio",
    "show_answer_timer",
    "anki_raw",
    "anki_mod",
    "anki_usn",
)


def upgrade() -> None:
    bind = op.get_bind()
    # Same text format SQLAlchemy uses for (naive UTC) DateTime columns on SQLite.
    now = datetime.now(UTC).strftime("%Y-%m-%d %H:%M:%S.%f")
    for (user_id,) in bind.execute(sa.text('SELECT id FROM "user"')).all():
        presets = bind.execute(
            sa.text("SELECT id, anki_id FROM deck_config WHERE user_id = :u ORDER BY id"),
            {"u": user_id},
        ).all()
        if not presets:
            continue
        kuru_default_id, kuru_default_anki_id = presets[0]
        duplicate = next((p for p in presets[1:] if p[1] == ANKI_DEFAULT_PRESET_ID), None)
        if kuru_default_anki_id is not None or duplicate is None:
            continue
        duplicate_id = duplicate[0]
        copied = ", ".join(f"{c} = (SELECT {c} FROM deck_config WHERE id = :dup)" for c in COPIED)
        # The duplicate gives up anki_id first: the default takes it over (re-imports match by it).
        bind.execute(
            sa.text("UPDATE deck_config SET anki_id = NULL WHERE id = :dup"), {"dup": duplicate_id}
        )
        bind.execute(
            sa.text(
                f"UPDATE deck_config SET {copied}, anki_id = :anki, updated_at = :now"  # noqa: S608
                " WHERE id = :default"
            ),
            {
                "dup": duplicate_id,
                "default": kuru_default_id,
                "anki": ANKI_DEFAULT_PRESET_ID,
                "now": now,
            },
        )
        bind.execute(
            sa.text("UPDATE deck SET config_id = :default, updated_at = :now WHERE config_id = :dup"),
            {"dup": duplicate_id, "default": kuru_default_id, "now": now},
        )
        bind.execute(sa.text("DELETE FROM deck_config WHERE id = :dup"), {"dup": duplicate_id})


def downgrade() -> None:
    pass
