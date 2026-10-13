"""Reading an Anki collection database into schema-independent records.

* **Schema 11** (``.anki2`` / ``.anki21``): note types, decks and presets are JSON blobs in ``col``.
* **Schema 18** (``.anki21b``): they live in dedicated tables with protobuf ``config`` columns.

Notes, cards and the review log have the same layout in both.
"""

from __future__ import annotations

import json
import sqlite3
from collections.abc import Iterator
from contextlib import closing
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from kuru.services.importer.protobuf import Message

FIELD_SEPARATOR = "\x1f"


@dataclass(slots=True)
class AnkiPreset:
    id: int
    name: str
    mod: int
    usn: int
    new_per_day: int = 20
    reviews_per_day: int = 200
    learn_steps: list[float] = field(default_factory=lambda: [1.0, 10.0])
    relearn_steps: list[float] = field(default_factory=lambda: [10.0])
    maximum_interval: int = 36500
    new_order_random: bool = False
    bury_new: bool = False
    bury_reviews: bool = False
    bury_interday_learning: bool = False
    autoplay: bool = True
    seconds_to_show_answer: float = 0.0
    desired_retention: float = 0.9
    fsrs_weights: list[float] = field(default_factory=list)
    raw: dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class AnkiDeck:
    id: int
    name: str
    mod: int
    usn: int
    config_id: int | None
    description: str = ""
    filtered: bool = False


@dataclass(slots=True)
class AnkiNoteType:
    id: int
    name: str
    mod: int
    usn: int
    kind: int
    css: str
    fields: list[dict[str, Any]]
    templates: list[dict[str, Any]]
    sort_field: int = 0


@dataclass(slots=True)
class AnkiNote:
    id: int
    guid: str
    mid: int
    mod: int
    usn: int
    tags: list[str]
    fields: list[str]
    sort_field: str


@dataclass(slots=True)
class AnkiCard:
    id: int
    nid: int
    did: int
    ord: int
    mod: int
    usn: int
    type: int
    queue: int
    due: int
    ivl: int
    factor: int
    reps: int
    lapses: int
    left: int
    odue: int
    odid: int
    flags: int
    data: dict[str, Any]


@dataclass(slots=True)
class AnkiReview:
    id: int
    cid: int
    usn: int
    ease: int
    ivl: int
    last_ivl: int
    factor: int
    time: int
    type: int


def _json(value: str | bytes | None) -> Any:
    if not value:
        return {}
    try:
        return json.loads(value)
    except (json.JSONDecodeError, UnicodeDecodeError):
        return {}


class CollectionReader:
    """Read-only access to an extracted Anki collection."""

    def __init__(self, path: Path) -> None:
        self._db = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
        self._db.row_factory = sqlite3.Row
        row = self._db.execute("SELECT crt, ver, conf, models, decks, dconf FROM col").fetchone()
        if row is None:
            raise ValueError("Collection has no col row")
        self.creation_time: int = int(row["crt"])
        self.schema_version: int = int(row["ver"])
        self._col = row
        self.config = self._read_config()

    def close(self) -> None:
        self._db.close()

    def __enter__(self) -> CollectionReader:
        return self

    def __exit__(self, *_exc: object) -> None:
        self.close()

    @property
    def _modern(self) -> bool:
        return self.schema_version >= 15

    # -- collection config --------------------------------------------------------------------

    def _read_config(self) -> dict[str, Any]:
        if self._modern:
            try:
                rows = self._db.execute("SELECT KEY, val FROM config").fetchall()
            except sqlite3.OperationalError:
                rows = []
            return {row[0]: _json(row[1]) for row in rows}
        conf = _json(self._col["conf"])
        return conf if isinstance(conf, dict) else {}

    @property
    def fsrs_enabled(self) -> bool:
        return bool(self.config.get("fsrs", False))

    @property
    def rollover_hour(self) -> int | None:
        value = self.config.get("rollover")
        return int(value) if isinstance(value, int | float) else None

    # -- presets -------------------------------------------------------------------------------

    def presets(self) -> list[AnkiPreset]:
        return self._presets_modern() if self._modern else self._presets_legacy()

    def _presets_modern(self) -> list[AnkiPreset]:
        presets = []
        for row in self._db.execute("SELECT id, name, mtime_secs, usn, config FROM deck_config"):
            cfg = Message.parse(row["config"])
            # Protobuf floats are 32-bit; round away artefacts such as 0.8500000238.
            weights = [round(w, 4) for w in (cfg.f32s(6) or cfg.f32s(5) or cfg.f32s(3))]
            presets.append(
                AnkiPreset(
                    id=row["id"],
                    name=row["name"],
                    mod=row["mtime_secs"],
                    usn=row["usn"],
                    learn_steps=[round(step, 3) for step in cfg.f32s(1)],
                    relearn_steps=[round(step, 3) for step in cfg.f32s(2)],
                    new_per_day=cfg.varint(9),
                    reviews_per_day=cfg.varint(10),
                    maximum_interval=cfg.varint(16) or 36500,
                    new_order_random=cfg.varint(20) == 1,
                    autoplay=not cfg.flag(23),
                    bury_new=cfg.flag(27),
                    bury_reviews=cfg.flag(28),
                    bury_interday_learning=cfg.flag(29),
                    desired_retention=round(cfg.f32(37), 4) or 0.9,
                    seconds_to_show_answer=round(cfg.f32(42), 1),
                    fsrs_weights=weights,
                    raw={"format": "protobuf", "config_hex": bytes(row["config"]).hex()},
                )
            )
        return presets

    def _presets_legacy(self) -> list[AnkiPreset]:
        presets = []
        dconf = _json(self._col["dconf"])
        for raw in dconf.values() if isinstance(dconf, dict) else []:
            new, rev, lapse = raw.get("new", {}), raw.get("rev", {}), raw.get("lapse", {})
            weights = (
                raw.get("fsrsParams6") or raw.get("fsrsParams5") or raw.get("fsrsWeights") or []
            )
            presets.append(
                AnkiPreset(
                    id=int(raw["id"]),
                    name=str(raw.get("name", "Default")),
                    mod=int(raw.get("mod", 0)),
                    usn=int(raw.get("usn", 0)),
                    learn_steps=[float(s) for s in new.get("delays", [1, 10])],
                    relearn_steps=[float(s) for s in lapse.get("delays", [10])],
                    new_per_day=int(new.get("perDay", 20)),
                    reviews_per_day=int(rev.get("perDay", 200)),
                    maximum_interval=int(rev.get("maxIvl", 36500)),
                    new_order_random=new.get("order", 1) == 0,
                    autoplay=bool(raw.get("autoplay", True)),
                    bury_new=bool(new.get("bury", False)),
                    bury_reviews=bool(rev.get("bury", False)),
                    bury_interday_learning=bool(raw.get("buryInterdayLearning", False)),
                    desired_retention=float(raw.get("desiredRetention", 0.9)),
                    seconds_to_show_answer=float(raw.get("secondsToShowAnswer", 0)),
                    fsrs_weights=[float(w) for w in weights],
                    raw=raw,
                )
            )
        return presets

    # -- decks ---------------------------------------------------------------------------------

    def decks(self) -> list[AnkiDeck]:
        return self._decks_modern() if self._modern else self._decks_legacy()

    def _decks_modern(self) -> list[AnkiDeck]:
        decks = []
        for row in self._db.execute("SELECT id, name, mtime_secs, usn, kind FROM decks"):
            kind = Message.parse(row["kind"])
            normal = kind.message(1)
            decks.append(
                AnkiDeck(
                    id=row["id"],
                    # Schema 18 separates hierarchy levels with \x1f instead of "::".
                    name=str(row["name"]).replace(FIELD_SEPARATOR, "::"),
                    mod=row["mtime_secs"],
                    usn=row["usn"],
                    config_id=normal.sint64(1) if normal is not None else None,
                    description=normal.text(4) if normal is not None else "",
                    filtered=kind.has(2),
                )
            )
        return decks

    def _decks_legacy(self) -> list[AnkiDeck]:
        decks = _json(self._col["decks"])
        return [
            AnkiDeck(
                id=int(raw["id"]),
                name=str(raw["name"]),
                mod=int(raw.get("mod", 0)),
                usn=int(raw.get("usn", 0)),
                config_id=int(raw["conf"]) if raw.get("conf") is not None else None,
                description=str(raw.get("desc", "")),
                filtered=bool(raw.get("dyn", 0)),
            )
            for raw in (decks.values() if isinstance(decks, dict) else [])
        ]

    # -- note types ----------------------------------------------------------------------------

    def note_types(self) -> list[AnkiNoteType]:
        return self._note_types_modern() if self._modern else self._note_types_legacy()

    def _note_types_modern(self) -> list[AnkiNoteType]:
        fields: dict[int, list[dict[str, Any]]] = {}
        for row in self._db.execute("SELECT ntid, ord, name FROM fields ORDER BY ntid, ord"):
            fields.setdefault(row["ntid"], []).append({"name": row["name"], "ord": row["ord"]})
        templates: dict[int, list[dict[str, Any]]] = {}
        for row in self._db.execute(
            "SELECT ntid, ord, name, config FROM templates ORDER BY ntid, ord"
        ):
            cfg = Message.parse(row["config"])
            templates.setdefault(row["ntid"], []).append(
                {"name": row["name"], "ord": row["ord"], "qfmt": cfg.text(1), "afmt": cfg.text(2)}
            )
        result = []
        for row in self._db.execute("SELECT id, name, mtime_secs, usn, config FROM notetypes"):
            cfg = Message.parse(row["config"])
            result.append(
                AnkiNoteType(
                    id=row["id"],
                    name=row["name"],
                    mod=row["mtime_secs"],
                    usn=row["usn"],
                    kind=cfg.varint(1),
                    css=cfg.text(3),
                    sort_field=cfg.varint(2),
                    fields=fields.get(row["id"], []),
                    templates=templates.get(row["id"], []),
                )
            )
        return result

    def _note_types_legacy(self) -> list[AnkiNoteType]:
        models = _json(self._col["models"])
        return [
            AnkiNoteType(
                id=int(raw["id"]),
                name=str(raw["name"]),
                mod=int(raw.get("mod", 0)),
                usn=int(raw.get("usn", 0)),
                kind=int(raw.get("type", 0)),
                css=str(raw.get("css", "")),
                sort_field=int(raw.get("sortf", 0)),
                fields=[{"name": f["name"], "ord": f["ord"]} for f in raw.get("flds", [])],
                templates=[
                    {"name": t["name"], "ord": t["ord"], "qfmt": t["qfmt"], "afmt": t["afmt"]}
                    for t in raw.get("tmpls", [])
                ],
            )
            for raw in (models.values() if isinstance(models, dict) else [])
        ]

    # -- bulk data -----------------------------------------------------------------------------

    def count(self, table: str) -> int:
        assert table in {"notes", "cards", "revlog"}
        return int(self._db.execute(f"SELECT count(*) FROM {table}").fetchone()[0])  # noqa: S608

    def notes(self) -> Iterator[AnkiNote]:
        with closing(
            self._db.execute("SELECT id, guid, mid, mod, usn, tags, flds, sfld FROM notes")
        ) as cursor:
            for row in cursor:
                yield AnkiNote(
                    id=row["id"],
                    guid=row["guid"],
                    mid=row["mid"],
                    mod=row["mod"],
                    usn=row["usn"],
                    tags=str(row["tags"]).split(),
                    fields=str(row["flds"]).split(FIELD_SEPARATOR),
                    sort_field=str(row["sfld"]),
                )

    def cards(self) -> Iterator[AnkiCard]:
        with closing(
            self._db.execute(
                "SELECT id, nid, did, ord, mod, usn, type, queue, due, ivl, factor, reps, lapses,"
                " left, odue, odid, flags, data FROM cards"
            )
        ) as cursor:
            for row in cursor:
                data = _json(row["data"])
                yield AnkiCard(
                    **{k: row[k] for k in row.keys() if k != "data"},  # noqa: SIM118
                    data=data if isinstance(data, dict) else {},
                )

    def reviews(self) -> Iterator[AnkiReview]:
        with closing(
            self._db.execute(
                "SELECT id, cid, usn, ease, ivl, lastIvl, factor, time, type FROM revlog"
                " ORDER BY cid, id"
            )
        ) as cursor:
            for row in cursor:
                yield AnkiReview(
                    id=row["id"],
                    cid=row["cid"],
                    usn=row["usn"],
                    ease=row["ease"],
                    ivl=row["ivl"],
                    last_ivl=row["lastIvl"],
                    factor=row["factor"],
                    time=row["time"],
                    type=row["type"],
                )
