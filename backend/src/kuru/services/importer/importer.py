"""Persisting an Anki collection into Kuru.

The import preserves *state continuity*: due dates, learning steps, suspension, counters and FSRS
memory state are taken from Anki where available, and the complete review log is copied. Where
Anki has no FSRS memory state (collections scheduled with SM-2), stability and difficulty are
derived by replaying the card's review log through FSRS while keeping Anki's due date.

Re-importing the same collection is supported: rows are matched by Anki id (note types, presets,
cards, reviews), note ``guid`` and deck name. Note content is refreshed; card scheduling is only
overwritten for cards that have not been reviewed in Kuru since.
"""

from __future__ import annotations

import hashlib
import mimetypes
import shutil
import tempfile
from collections import defaultdict
from collections.abc import Callable, Iterable, Iterator
from dataclasses import asdict, dataclass
from datetime import timedelta
from itertools import islice
from pathlib import Path
from typing import Any

from sqlalchemy import insert, update
from sqlmodel import Session, col, select

from kuru.core.time import from_epoch_ms, from_epoch_s, utcnow
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
    ReviewKind,
    ReviewLog,
    User,
)
from kuru.services.fsrs import FsrsEngine, ReplayEntry
from kuru.services.importer.package import AnkiPackage, MediaEntry
from kuru.services.importer.reader import (
    AnkiCard,
    AnkiPreset,
    AnkiReview,
    CollectionReader,
)
from kuru.services.presets import default_preset

ProgressCallback = Callable[[str, float], None]
BATCH_SIZE = 2000

#: Id of Anki's built-in "Default" options group.
ANKI_DEFAULT_PRESET_ID = 1

# Anki queue values
QUEUE_SUSPENDED = -1
QUEUE_LEARNING = 1
EPOCH_THRESHOLD = 1_000_000_000  # dues above this are epoch seconds, below are day numbers


@dataclass(slots=True)
class ImportStats:
    """Summary of what an import changed."""

    note_types: int = 0
    decks: int = 0
    presets: int = 0
    notes_added: int = 0
    notes_updated: int = 0
    cards_added: int = 0
    cards_updated: int = 0
    cards_skipped: int = 0
    reviews_added: int = 0
    memory_from_anki: int = 0
    memory_from_revlog: int = 0
    memory_estimated: int = 0
    media_files: int = 0
    package_version: int = 0
    fsrs_enabled_in_anki: bool = False

    def as_dict(self) -> dict[str, Any]:
        return asdict(self)


def _batched[T](items: Iterable[T], size: int = BATCH_SIZE) -> Iterator[list[T]]:
    iterator = iter(items)
    while batch := list(islice(iterator, size)):
        yield batch


def _clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


class AnkiImporter:
    """Imports one package for one user."""

    def __init__(
        self,
        session: Session,
        user: User,
        media_dir: Path,
        progress: ProgressCallback | None = None,
    ) -> None:
        assert user.id is not None
        self.session = session
        self.user = user
        self.user_id: int = user.id
        self.media_dir = media_dir
        self._progress = progress or (lambda _stage, _fraction: None)
        self.stats = ImportStats()

        self._presets: dict[int, DeckConfig] = {}  # anki preset id → preset
        self._decks: dict[int, Deck] = {}  # anki deck id → deck
        self._note_types: dict[int, NoteType] = {}  # anki notetype id → note type
        self._notes: dict[int, int] = {}  # anki note id → kuru note id
        self._cards: dict[int, int] = {}  # anki card id → kuru card id
        self._anki_decks: dict[int, Any] = {}
        self._engines: dict[int | None, FsrsEngine] = {}

    # -- entry point ---------------------------------------------------------------------------

    def run(self, package: AnkiPackage) -> ImportStats:
        """Import everything from ``package`` and commit."""
        self.stats.package_version = int(package.version)
        with CollectionReader(package.collection_path) as reader:
            self.stats.fsrs_enabled_in_anki = reader.fsrs_enabled
            self._progress("reading", 0.12)
            had_cards = self.session.exec(
                select(Card.id).where(Card.user_id == self.user_id).limit(1)
            ).first()
            if had_cards is None and reader.rollover_hour is not None:
                self.user.day_rollover_hour = int(_clamp(reader.rollover_hour, 0, 23))
                self.session.add(self.user)

            self._import_presets(reader.presets())
            self._import_note_types(reader)
            self._progress("structure", 0.2)
            reviews_by_card = self._load_reviews(reader)
            self._import_decks(reader)
            self._import_notes(reader)
            self._progress("notes", 0.5)
            self._import_cards(reader, reviews_by_card)
            self._progress("cards", 0.75)
            self._import_reviews(reviews_by_card)
            self._progress("reviews", 0.9)
        self.session.commit()
        self._import_media(package)
        self.session.commit()
        self._progress("done", 1.0)
        return self.stats

    # -- presets, note types, decks ------------------------------------------------------------

    def _import_presets(self, presets: list[AnkiPreset]) -> None:
        existing = {
            p.anki_id: p
            for p in self.session.exec(
                select(DeckConfig).where(
                    DeckConfig.user_id == self.user_id, col(DeckConfig.anki_id).is_not(None)
                )
            )
        }
        # Anki's built-in options group always has id 1 (it cannot be deleted in Anki). It is the
        # same concept as Kuru's Default preset, so it fills that preset instead of duplicating it.
        if ANKI_DEFAULT_PRESET_ID not in existing:
            kuru_default = default_preset(self.session, self.user)
            if kuru_default.anki_id is None:
                existing[ANKI_DEFAULT_PRESET_ID] = kuru_default
        for anki in presets:
            preset = existing.get(anki.id) or DeckConfig(user_id=self.user_id, anki_id=anki.id)
            preset.anki_id = anki.id
            preset.name = anki.name[:200]
            preset.anki_mod, preset.anki_usn = anki.mod, anki.usn
            preset.new_per_day = max(0, anki.new_per_day)
            preset.reviews_per_day = max(0, anki.reviews_per_day)
            preset.learning_steps = [s for s in anki.learn_steps if s > 0]
            preset.relearning_steps = [s for s in anki.relearn_steps if s > 0]
            preset.maximum_interval = int(_clamp(anki.maximum_interval, 1, 36500))
            preset.new_card_order = (
                NewCardOrder.RANDOM if anki.new_order_random else NewCardOrder.SEQUENTIAL
            )
            preset.bury_new = anki.bury_new
            preset.bury_reviews = anki.bury_reviews
            preset.bury_interday_learning = anki.bury_interday_learning
            preset.autoplay_audio = anki.autoplay
            preset.show_answer_timer = round(anki.seconds_to_show_answer)
            preset.desired_retention = _clamp(anki.desired_retention, 0.7, 0.99)
            preset.fsrs_weights = anki.fsrs_weights or None
            preset.anki_raw = anki.raw
            preset.updated_at = utcnow()
            self.session.add(preset)
            self._presets[anki.id] = preset
        self.session.flush()
        self.stats.presets = len(presets)

    def _import_note_types(self, reader: CollectionReader) -> None:
        existing = {
            nt.anki_id: nt
            for nt in self.session.exec(select(NoteType).where(NoteType.user_id == self.user_id))
        }
        for anki in reader.note_types():
            note_type = existing.get(anki.id) or NoteType(
                user_id=self.user_id, anki_id=anki.id, name=anki.name[:500]
            )
            note_type.name = anki.name[:500]
            note_type.kind = NoteTypeKind.CLOZE if anki.kind == 1 else NoteTypeKind.STANDARD
            note_type.fields = anki.fields
            note_type.templates = anki.templates
            note_type.css = anki.css
            note_type.anki_mod, note_type.anki_usn = anki.mod, anki.usn
            note_type.anki_raw = {"sort_field": anki.sort_field}
            note_type.updated_at = utcnow()
            self.session.add(note_type)
            self._note_types[anki.id] = note_type
        self.session.flush()
        self.stats.note_types = len(self._note_types)

    def _import_decks(self, reader: CollectionReader) -> None:
        self._anki_decks = {deck.id: deck for deck in reader.decks()}
        self._deck_by_name = {
            d.name: d for d in self.session.exec(select(Deck).where(Deck.user_id == self.user_id))
        }

    def _deck_for(self, anki_deck_id: int) -> Deck:
        """Resolve (creating on demand) the Kuru deck for an Anki deck id."""
        if anki_deck_id in self._decks:
            return self._decks[anki_deck_id]
        anki = self._anki_decks.get(anki_deck_id)
        name = anki.name if anki is not None and not anki.filtered else "Default"
        deck = self._deck_by_name.get(name)
        if deck is None:
            deck = Deck(user_id=self.user_id, name=name[:500])
            self.stats.decks += 1
        if anki is not None and not anki.filtered:
            deck.anki_id, deck.anki_mod, deck.anki_usn = anki.id, anki.mod, anki.usn
            deck.description = anki.description
            preset = self._presets.get(anki.config_id) if anki.config_id is not None else None
            if preset is not None:
                deck.config_id = preset.id
        deck.updated_at = utcnow()
        self.session.add(deck)
        self.session.flush()
        self._deck_by_name[deck.name] = deck
        self._decks[anki_deck_id] = deck
        # Make sure parent decks exist so the hierarchy is navigable.
        parts = deck.name.split("::")
        for depth in range(1, len(parts)):
            parent = "::".join(parts[:depth])
            if parent not in self._deck_by_name:
                parent_deck = Deck(user_id=self.user_id, name=parent, config_id=deck.config_id)
                self.session.add(parent_deck)
                self.session.flush()
                self._deck_by_name[parent] = parent_deck
                self.stats.decks += 1
        return deck

    # -- notes ---------------------------------------------------------------------------------

    def _import_notes(self, reader: CollectionReader) -> None:
        existing = dict(
            self.session.exec(select(Note.guid, Note.id).where(Note.user_id == self.user_id)).all()
        )
        now = utcnow()
        for batch in _batched(reader.notes()):
            inserts: list[dict[str, Any]] = []
            updates: list[dict[str, Any]] = []
            for note in batch:
                note_type = self._note_types.get(note.mid)
                if note_type is None:
                    continue
                values = {
                    "user_id": self.user_id,
                    "guid": note.guid[:64],
                    "note_type_id": note_type.id,
                    "fields": note.fields,
                    "tags": note.tags,
                    "sort_field": note.sort_field[:1000],
                    "anki_id": note.id,
                    "anki_mod": note.mod,
                    "anki_usn": note.usn,
                    "updated_at": now,
                }
                kuru_id = existing.get(note.guid[:64])
                if kuru_id is None:
                    inserts.append(values)
                else:
                    updates.append({"id": kuru_id, **values})
                    self._notes[note.id] = kuru_id
            if inserts:
                self.session.execute(insert(Note), inserts)
                self.stats.notes_added += len(inserts)
            if updates:
                self.session.execute(update(Note), updates)
                self.stats.notes_updated += len(updates)
            if inserts:
                guids = [row["guid"] for row in inserts]
                for kuru_id, anki_id in self.session.exec(
                    select(Note.id, Note.anki_id).where(
                        Note.user_id == self.user_id, col(Note.guid).in_(guids)
                    )
                ):
                    assert kuru_id is not None and anki_id is not None
                    self._notes[anki_id] = kuru_id

    # -- cards ---------------------------------------------------------------------------------

    def _engine_for(self, deck: Deck) -> FsrsEngine:
        if deck.config_id not in self._engines:
            preset = (
                self.session.get(DeckConfig, deck.config_id) if deck.config_id is not None else None
            )
            self._engines[deck.config_id] = FsrsEngine.for_config(preset)
        return self._engines[deck.config_id]

    def _preset_for(self, deck: Deck) -> DeckConfig | None:
        return self.session.get(DeckConfig, deck.config_id) if deck.config_id is not None else None

    def _load_reviews(self, reader: CollectionReader) -> dict[int, list[AnkiReview]]:
        by_card: dict[int, list[AnkiReview]] = defaultdict(list)
        for review in reader.reviews():
            by_card[review.cid].append(review)
        return by_card

    def _card_values(
        self,
        anki: AnkiCard,
        deck: Deck,
        crt: int,
        reviews: list[AnkiReview],
    ) -> dict[str, Any]:
        """Translate Anki scheduling into Kuru card columns."""
        due_raw = anki.odue if anki.odid else anki.due
        values: dict[str, Any] = {
            "suspended": anki.queue == QUEUE_SUSPENDED,
            "flags": anki.flags & 0b111,
            "reps": anki.reps,
            "lapses": anki.lapses,
            "buried_until": None,
            "step": None,
            "stability": None,
            "difficulty": None,
            "due": None,
            "last_review": None,
            "position": 0,
        }
        if anki.type == 0:
            values.update(state=CardState.NEW, position=due_raw)
            return values

        state = {1: CardState.LEARNING, 2: CardState.REVIEW, 3: CardState.RELEARNING}.get(
            anki.type, CardState.REVIEW
        )
        if due_raw > EPOCH_THRESHOLD or anki.queue == QUEUE_LEARNING:
            due = from_epoch_s(due_raw)
        else:
            due = from_epoch_s(crt) + timedelta(days=due_raw)
        values.update(state=state, due=due)

        if state in (CardState.LEARNING, CardState.RELEARNING):
            preset = self._preset_for(deck)
            steps = (
                (preset.learning_steps if state == CardState.LEARNING else preset.relearning_steps)
                if preset is not None
                else []
            )
            remaining = anki.left % 1000
            values["step"] = max(0, min(len(steps) - remaining, max(len(steps) - 1, 0)))

        rated = [r for r in reviews if 1 <= r.ease <= 4]
        if "lrt" in anki.data:
            values["last_review"] = from_epoch_s(int(anki.data["lrt"]))
        elif rated:
            values["last_review"] = from_epoch_ms(rated[-1].id)
        elif state == CardState.REVIEW:
            values["last_review"] = due - timedelta(days=max(anki.ivl, 1))

        stability, difficulty = anki.data.get("s"), anki.data.get("d")
        if isinstance(stability, int | float) and isinstance(difficulty, int | float):
            values.update(stability=float(stability), difficulty=float(difficulty))
            self.stats.memory_from_anki += 1
            return values

        memory = (
            self._engine_for(deck).replay(0, (self._replay_entry(r) for r in reviews))
            if reviews
            else None
        )
        if memory is not None and memory.stability is not None and memory.difficulty is not None:
            values.update(stability=memory.stability, difficulty=memory.difficulty)
            self.stats.memory_from_revlog += 1
        else:
            # No history: approximate from SM-2 interval and ease (FSRS stability ≈ interval
            # at 90 % retention; ease 130 %..300 % mapped onto difficulty 10..1).
            values["stability"] = max(float(anki.ivl), 0.5)
            ease = anki.factor / 1000 if anki.factor else 2.5
            values["difficulty"] = _clamp(10 - (ease - 1.3) / 1.7 * 9, 1.0, 10.0)
            self.stats.memory_estimated += 1
        return values

    @staticmethod
    def _replay_entry(review: AnkiReview) -> ReplayEntry:
        try:
            kind = ReviewKind(review.type)
        except ValueError:
            kind = ReviewKind.REVIEW
        return ReplayEntry(
            rating=review.ease,
            reviewed_at=from_epoch_ms(review.id),
            kind=kind,
            interval=review.ivl,
            factor=review.factor,
        )

    def _import_cards(
        self, reader: CollectionReader, reviews_by_card: dict[int, list[AnkiReview]]
    ) -> None:
        existing: dict[int, int] = {
            anki_id: card_id
            for card_id, anki_id in self.session.exec(
                select(Card.id, Card.anki_id).where(
                    Card.user_id == self.user_id, col(Card.anki_id).is_not(None)
                )
            )
            if anki_id is not None and card_id is not None
        }
        reviewed_in_kuru = set(
            self.session.exec(
                select(ReviewLog.card_id)
                .where(ReviewLog.user_id == self.user_id, col(ReviewLog.memory_before).is_not(None))
                .distinct()
            ).all()
        )
        crt = reader.creation_time
        now = utcnow()
        for batch in _batched(reader.cards()):
            inserts: list[dict[str, Any]] = []
            updates: list[dict[str, Any]] = []
            for anki in batch:
                note_id = self._notes.get(anki.nid)
                if note_id is None:
                    continue
                deck = self._deck_for(anki.odid or anki.did)
                base = {
                    "user_id": self.user_id,
                    "note_id": note_id,
                    "deck_id": deck.id,
                    "ord": anki.ord,
                    "anki_id": anki.id,
                    "anki_mod": anki.mod,
                    "anki_usn": anki.usn,
                    "updated_at": now,
                }
                kuru_id = existing.get(anki.id)
                if kuru_id is not None and kuru_id in reviewed_in_kuru:
                    updates.append({"id": kuru_id, **base})
                    self._cards[anki.id] = kuru_id
                    self.stats.cards_skipped += 1
                    continue
                values = {**base, **self._card_values(anki, deck, crt, reviews_by_card[anki.id])}
                if kuru_id is None:
                    inserts.append(values)
                else:
                    updates.append({"id": kuru_id, **values})
                    self._cards[anki.id] = kuru_id
            if inserts:
                self.session.execute(insert(Card), inserts)
                self.stats.cards_added += len(inserts)
                ids = [row["anki_id"] for row in inserts]
                for kuru_id, anki_id in self.session.exec(
                    select(Card.id, Card.anki_id).where(
                        Card.user_id == self.user_id, col(Card.anki_id).in_(ids)
                    )
                ):
                    assert kuru_id is not None and anki_id is not None
                    self._cards[anki_id] = kuru_id
            if updates:
                self.session.execute(update(Card), updates)
        self.stats.cards_updated = len(self._cards) - self.stats.cards_added
        self.stats.cards_updated -= self.stats.cards_skipped

    # -- review log ----------------------------------------------------------------------------

    def _import_reviews(self, reviews_by_card: dict[int, list[AnkiReview]]) -> None:
        known = set(
            self.session.exec(
                select(ReviewLog.anki_id).where(
                    ReviewLog.user_id == self.user_id, col(ReviewLog.anki_id).is_not(None)
                )
            ).all()
        )

        def rows() -> Iterator[dict[str, Any]]:
            for anki_card_id, reviews in reviews_by_card.items():
                card_id = self._cards.get(anki_card_id)
                if card_id is None:
                    continue
                for review in reviews:
                    if review.id in known:
                        continue
                    yield {
                        "id": f"anki-{self.user_id}-{review.id}-{review.cid}",
                        "user_id": self.user_id,
                        "card_id": card_id,
                        "anki_id": review.id,
                        "anki_card_id": review.cid,
                        "anki_usn": review.usn,
                        "rating": review.ease if 0 <= review.ease <= 4 else 0,
                        "reviewed_at": from_epoch_ms(review.id),
                        "duration_ms": max(0, review.time),
                        "kind": review.type if 0 <= review.type <= 5 else ReviewKind.REVIEW,
                        "interval": review.ivl,
                        "last_interval": review.last_ivl,
                        "factor": review.factor,
                        "memory_before": None,
                    }

        for batch in _batched(rows()):
            # Review ids are only unique per card in theory; guard against duplicates in batch.
            unique = list({row["id"]: row for row in batch}.values())
            self.session.execute(insert(ReviewLog), unique)
            self.stats.reviews_added += len(unique)

    # -- media ---------------------------------------------------------------------------------

    def _import_media(self, package: AnkiPackage) -> None:
        existing = {
            m.filename: m
            for m in self.session.exec(select(MediaFile).where(MediaFile.user_id == self.user_id))
        }
        total = max(len(package.media), 1)
        for index, entry in enumerate(package.media):
            sha256, size = self._store_blob(package, entry)
            media = existing.get(entry.filename) or MediaFile(
                user_id=self.user_id, filename=entry.filename, sha256=sha256
            )
            media.sha256, media.size = sha256, size
            media.mime_type = mimetypes.guess_type(entry.filename)[0] or "application/octet-stream"
            media.updated_at = utcnow()
            self.session.add(media)
            self.stats.media_files += 1
            if index % 200 == 0:
                self.session.flush()
                self._progress("media", 0.9 + 0.1 * index / total)

    def _store_blob(self, package: AnkiPackage, entry: MediaEntry) -> tuple[str, int]:
        digest = hashlib.sha256()
        size = 0
        self.media_dir.mkdir(parents=True, exist_ok=True)
        with (
            package.open_media(entry) as source,
            tempfile.NamedTemporaryFile(dir=self.media_dir, delete=False) as tmp,
        ):
            while chunk := source.read(1024 * 1024):
                digest.update(chunk)
                tmp.write(chunk)
                size += len(chunk)
        sha = digest.hexdigest()
        target = media_path(self.media_dir, sha)
        target.parent.mkdir(parents=True, exist_ok=True)
        if target.exists():
            Path(tmp.name).unlink()
        else:
            shutil.move(tmp.name, target)
        return sha, size


def media_path(media_dir: Path, sha256: str) -> Path:
    """Location of a content-addressed media blob."""
    return media_dir / sha256[:2] / sha256
