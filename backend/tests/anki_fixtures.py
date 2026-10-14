"""Builders for synthetic Anki packages (schema 11 legacy and schema 18 "latest").

The table layouts follow Anki's ``rslib/src/storage/schema11.sql`` and the schema-18 upgrade. Only
the columns Kuru reads are populated meaningfully.
"""

from __future__ import annotations

import io
import json
import sqlite3
import struct
import zipfile
from dataclasses import dataclass
from pathlib import Path

import zstandard

CRT = 1_700_000_000  # collection creation (epoch seconds, at the day rollover)
DAY = 86400
NOW_DAYS = 800  # "today" relative to CRT for review dues

BASIC_ID = 1_600_000_000_001
CLOZE_ID = 1_600_000_000_002
DECK_ID = 1_600_000_000_100
FILTERED_DECK_ID = 1_600_000_000_200
PRESET_ID = 2
FSRS5_WEIGHTS = [
    0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046, 1.54575, 0.1192,
    1.01925, 1.9395, 0.11, 0.29605, 2.2698, 0.2315, 2.9898, 0.51655, 0.6621,
]  # fmt: skip

LEARN_DUE = CRT + NOW_DAYS * DAY + 600
MEDIA = {"sound.mp3": b"ID3\x03fake-mp3-data", "image.png": b"\x89PNG\r\n\x1a\nfake"}


@dataclass(frozen=True)
class CardSpec:
    id: int
    nid: int
    did: int
    ord: int
    type: int
    queue: int
    due: int
    ivl: int = 0
    factor: int = 0
    reps: int = 0
    lapses: int = 0
    left: int = 0
    odue: int = 0
    odid: int = 0
    data: str = ""


NOTES = [
    # id, guid, mid, fields
    (101, "guidA", BASIC_ID, ["犬", "dog [sound:sound.mp3]"]),
    (102, "guidB", BASIC_ID, ["猫", "cat <img src='image.png'>"]),
    (103, "guidC", BASIC_ID, ["鳥", "bird"]),
    (104, "guidD", BASIC_ID, ["魚", "fish"]),
    (105, "guidE", CLOZE_ID, ["{{c1::Tokyo}} is the capital of {{c2::Japan}}", ""]),
    (106, "guidF", BASIC_ID, ["馬", "horse"]),
]

CARDS = [
    # new card at position 7
    CardSpec(1001, 101, DECK_ID, 0, type=0, queue=0, due=7),
    # intraday learning card, 1 step remaining of [1, 10]
    CardSpec(1002, 102, DECK_ID, 0, type=1, queue=1, due=LEARN_DUE, left=1001, reps=1),
    # review card with FSRS memory state stored by Anki
    CardSpec(
        1003, 103, DECK_ID, 0, type=2, queue=2, due=NOW_DAYS + 3, ivl=10, factor=2500, reps=4,
        data=json.dumps({"s": 12.5, "d": 4.2, "lrt": CRT + (NOW_DAYS - 7) * DAY}),
    ),
    # review card scheduled by SM-2, memory state must come from the revlog
    CardSpec(1004, 104, DECK_ID, 0, type=2, queue=2, due=NOW_DAYS, ivl=6, factor=2300, reps=3),
    # cloze cards; the second one is suspended
    CardSpec(1005, 105, DECK_ID, 0, type=0, queue=0, due=8),
    CardSpec(1006, 105, DECK_ID, 1, type=2, queue=-1, due=NOW_DAYS + 30, ivl=40, factor=2600),
    # review card currently in a filtered deck
    CardSpec(
        1007, 106, FILTERED_DECK_ID, 0, type=2, queue=2, due=-100000, ivl=5, factor=2500,
        odue=NOW_DAYS + 1, odid=DECK_ID,
    ),
]  # fmt: skip

REVLOG = [
    # id (ms), cid, ease, ivl, lastIvl, factor, time, type
    ((CRT + 790 * DAY) * 1000, 1004, 3, -600, 0, 0, 5000, 0),
    ((CRT + 790 * DAY + 600) * 1000, 1004, 3, 1, -600, 2500, 4000, 0),
    ((CRT + 791 * DAY) * 1000, 1004, 3, 3, 1, 2500, 3000, 1),
    ((CRT + 794 * DAY) * 1000, 1004, 2, 6, 3, 2350, 6000, 1),
    ((CRT + 793 * DAY) * 1000, 1003, 3, 10, 4, 2500, 2000, 1),
    ((CRT + 799 * DAY) * 1000, 1002, 3, -600, 0, 0, 2000, 0),
]


# -- protobuf encoding -------------------------------------------------------------------------


def _varint(value: int) -> bytes:
    value &= (1 << 64) - 1
    out = bytearray()
    while True:
        byte = value & 0x7F
        value >>= 7
        if value:
            out.append(byte | 0x80)
        else:
            out.append(byte)
            return bytes(out)


def pb_varint(number: int, value: int) -> bytes:
    return _varint(number << 3) + _varint(value)


def pb_bytes(number: int, value: bytes | str) -> bytes:
    raw = value.encode() if isinstance(value, str) else value
    return _varint(number << 3 | 2) + _varint(len(raw)) + raw


def pb_floats(number: int, values: list[float]) -> bytes:
    return pb_bytes(number, struct.pack(f"<{len(values)}f", *values))


def pb_float(number: int, value: float) -> bytes:
    return _varint(number << 3 | 5) + struct.pack("<f", value)


# -- schema helpers ----------------------------------------------------------------------------

_COMMON_TABLES = """
CREATE TABLE notes (id integer primary key, guid text not null, mid integer not null,
  mod integer not null, usn integer not null, tags text not null, flds text not null,
  sfld integer not null, csum integer not null, flags integer not null, data text not null);
CREATE TABLE cards (id integer primary key, nid integer not null, did integer not null,
  ord integer not null, mod integer not null, usn integer not null, type integer not null,
  queue integer not null, due integer not null, ivl integer not null, factor integer not null,
  reps integer not null, lapses integer not null, left integer not null, odue integer not null,
  odid integer not null, flags integer not null, data text not null);
CREATE TABLE revlog (id integer primary key, cid integer not null, usn integer not null,
  ease integer not null, ivl integer not null, lastIvl integer not null, factor integer not null,
  time integer not null, type integer not null);
CREATE TABLE graves (usn integer not null, oid integer not null, type integer not null);
CREATE TABLE col (id integer primary key, crt integer not null, mod integer not null,
  scm integer not null, ver integer not null, dty integer not null, usn integer not null,
  ls integer not null, conf text not null, models text not null, decks text not null,
  dconf text not null, tags text not null);
"""


def _insert_common(db: sqlite3.Connection) -> None:
    for nid, guid, mid, fields in NOTES:
        db.execute(
            "INSERT INTO notes VALUES (?,?,?,?,?,?,?,?,?,?,?)",
            (nid, guid, mid, CRT, -1, " vocab jp ", "\x1f".join(fields), fields[0], 0, 0, ""),
        )
    for c in CARDS:
        db.execute(
            "INSERT INTO cards VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (
                c.id, c.nid, c.did, c.ord, CRT, -1, c.type, c.queue, c.due, c.ivl, c.factor,
                c.reps, c.lapses, c.left, c.odue, c.odid, 0, c.data,
            ),
        )  # fmt: skip
    for row in REVLOG:
        rid, cid, ease, ivl, last, factor, time, rtype = row
        db.execute(
            "INSERT INTO revlog VALUES (?,?,?,?,?,?,?,?,?)",
            (rid, cid, -1, ease, ivl, last, factor, time, rtype),
        )


def _templates_basic() -> list[dict[str, object]]:
    return [
        {
            "name": "Card 1",
            "ord": 0,
            "qfmt": "{{Front}}",
            "afmt": "{{FrontSide}}<hr id=answer>{{Back}}",
        }
    ]


def build_schema11(path: Path) -> None:
    db = sqlite3.connect(path)
    db.executescript(_COMMON_TABLES)
    models = {
        str(BASIC_ID): {
            "id": BASIC_ID, "name": "Basic", "type": 0, "mod": CRT, "usn": -1, "sortf": 0,
            "css": ".card { font-size: 20px; }",
            "flds": [{"name": "Front", "ord": 0}, {"name": "Back", "ord": 1}],
            "tmpls": _templates_basic(),
        },
        str(CLOZE_ID): {
            "id": CLOZE_ID, "name": "Cloze", "type": 1, "mod": CRT, "usn": -1, "sortf": 0,
            "css": ".cloze { color: blue; }",
            "flds": [{"name": "Text", "ord": 0}, {"name": "Back Extra", "ord": 1}],
            "tmpls": [{"name": "Cloze", "ord": 0, "qfmt": "{{cloze:Text}}",
                       "afmt": "{{cloze:Text}}<br>{{Back Extra}}"}],
        },
    }  # fmt: skip
    decks = {
        "1": {"id": 1, "name": "Default", "conf": 1, "desc": "", "dyn": 0, "mod": CRT, "usn": -1},
        str(DECK_ID): {"id": DECK_ID, "name": "Japanese::Vocab", "conf": PRESET_ID,
                       "desc": "Core words", "dyn": 0, "mod": CRT, "usn": -1},
        str(FILTERED_DECK_ID): {"id": FILTERED_DECK_ID, "name": "Cram", "dyn": 1, "mod": CRT,
                                "usn": -1, "desc": ""},
    }  # fmt: skip
    dconf = {
        "1": {"id": 1, "name": "Default", "mod": CRT, "usn": -1, "new": {"perDay": 20}},
        str(PRESET_ID): {
            "id": PRESET_ID, "name": "Japanese", "mod": CRT, "usn": -1,
            "new": {"perDay": 15, "delays": [1, 10], "order": 1, "bury": True},
            "rev": {"perDay": 150, "maxIvl": 3650, "bury": False},
            "lapse": {"delays": [10]}, "autoplay": False, "desiredRetention": 0.85,
            "fsrsParams5": FSRS5_WEIGHTS,
        },
    }  # fmt: skip
    db.execute(
        "INSERT INTO col VALUES (1,?,?,?,11,0,0,0,?,?,?,?,?)",
        (
            CRT, CRT, CRT, json.dumps({"fsrs": True, "rollover": 5}), json.dumps(models),
            json.dumps(decks), json.dumps(dconf), "{}",
        ),
    )  # fmt: skip
    _insert_common(db)
    db.commit()
    db.close()


def _unicase(a: str, b: str) -> int:
    """Stand-in for Anki's `unicase` collation (only Anki defines it)."""
    return (a.casefold() > b.casefold()) - (a.casefold() < b.casefold())


def build_schema18(path: Path) -> None:
    db = sqlite3.connect(path)
    # Like real Anki collections, names use the custom `unicase` collation and some tables are
    # WITHOUT ROWID with indexes over those columns. Readers must define the collation, otherwise
    # newer SQLite versions fail with "no query solution" / "no such collation sequence".
    db.create_collation("unicase", _unicase)
    db.executescript(_COMMON_TABLES)
    db.executescript("""
    CREATE TABLE config (KEY text not null primary key, usn integer not null,
      mtime_secs integer not null, val blob not null) without rowid;
    CREATE TABLE deck_config (id integer primary key not null, name text not null collate unicase,
      mtime_secs integer not null, usn integer not null, config blob not null);
    CREATE TABLE decks (id integer primary key not null, name text not null collate unicase,
      mtime_secs integer not null, usn integer not null, common blob not null,
      kind blob not null);
    CREATE UNIQUE INDEX idx_decks_name ON decks (name);
    CREATE TABLE notetypes (id integer not null primary key, name text not null collate unicase,
      mtime_secs integer not null, usn integer not null, config blob not null);
    CREATE UNIQUE INDEX idx_notetypes_name ON notetypes (name);
    CREATE TABLE fields (ntid integer not null, ord integer not null,
      name text not null collate unicase, config blob not null,
      primary key (ntid, ord)) without rowid;
    CREATE UNIQUE INDEX idx_fields_name_ntid ON fields (name, ntid);
    CREATE TABLE templates (ntid integer not null, ord integer not null,
      name text not null collate unicase, mtime_secs integer not null, usn integer not null,
      config blob not null, primary key (ntid, ord)) without rowid;
    CREATE UNIQUE INDEX idx_templates_name_ntid ON templates (name, ntid);
    CREATE TABLE tags (tag text not null primary key collate unicase, usn integer not null,
      collapsed boolean not null, config blob null) without rowid;
    """)
    db.execute("INSERT INTO col VALUES (1,?,?,?,18,0,0,0,'','','','','')", (CRT, CRT, CRT))
    db.execute("INSERT INTO config VALUES ('fsrs', 0, ?, ?)", (CRT, b"true"))
    db.execute("INSERT INTO config VALUES ('rollover', 0, ?, ?)", (CRT, b"5"))

    preset = (
        pb_floats(1, [1.0, 10.0])
        + pb_floats(2, [10.0])
        + pb_floats(5, FSRS5_WEIGHTS)
        + pb_varint(9, 15)
        + pb_varint(10, 150)
        + pb_varint(16, 3650)
        + pb_varint(23, 1)  # disable_autoplay
        + pb_varint(27, 1)  # bury_new
        + pb_float(37, 0.85)
    )
    db.execute("INSERT INTO deck_config VALUES (1, 'Default', ?, -1, ?)", (CRT, pb_varint(9, 20)))
    db.execute("INSERT INTO deck_config VALUES (?, 'Japanese', ?, -1, ?)", (PRESET_ID, CRT, preset))

    def normal(config_id: int, desc: str = "") -> bytes:
        return pb_bytes(1, pb_varint(1, config_id) + (pb_bytes(4, desc) if desc else b""))

    db.execute("INSERT INTO decks VALUES (1, 'Default', ?, -1, x'', ?)", (CRT, normal(1)))
    db.execute(
        "INSERT INTO decks VALUES (?, ?, ?, -1, x'', ?)",
        (DECK_ID, "Japanese\x1fVocab", CRT, normal(PRESET_ID, "Core words")),
    )
    db.execute(
        "INSERT INTO decks VALUES (?, 'Cram', ?, -1, x'', ?)",
        (FILTERED_DECK_ID, CRT, pb_bytes(2, pb_varint(1, 1))),
    )

    db.execute(
        "INSERT INTO notetypes VALUES (?, 'Basic', ?, -1, ?)",
        (BASIC_ID, CRT, pb_bytes(3, ".card { font-size: 20px; }")),
    )
    db.execute(
        "INSERT INTO notetypes VALUES (?, 'Cloze', ?, -1, ?)",
        (CLOZE_ID, CRT, pb_varint(1, 1) + pb_bytes(3, ".cloze { color: blue; }")),
    )
    for ntid, names in ((BASIC_ID, ["Front", "Back"]), (CLOZE_ID, ["Text", "Back Extra"])):
        for ordinal, name in enumerate(names):
            db.execute("INSERT INTO fields VALUES (?,?,?,x'')", (ntid, ordinal, name))
    basic = _templates_basic()[0]
    db.execute(
        "INSERT INTO templates VALUES (?, 0, 'Card 1', ?, -1, ?)",
        (BASIC_ID, CRT, pb_bytes(1, str(basic["qfmt"])) + pb_bytes(2, str(basic["afmt"]))),
    )
    db.execute(
        "INSERT INTO templates VALUES (?, 0, 'Cloze', ?, -1, ?)",
        (
            CLOZE_ID,
            CRT,
            pb_bytes(1, "{{cloze:Text}}") + pb_bytes(2, "{{cloze:Text}}<br>{{Back Extra}}"),
        ),
    )
    _insert_common(db)
    db.commit()
    db.close()


def build_package(target: Path, *, latest: bool) -> Path:
    """Write an ``.apkg`` in the legacy-2 (``latest=False``) or latest format."""
    db_path = target.with_suffix(".sqlite")
    db_path.unlink(missing_ok=True)
    (build_schema18 if latest else build_schema11)(db_path)
    compressor = zstandard.ZstdCompressor()
    with zipfile.ZipFile(target, "w") as archive:
        media_names = list(MEDIA)
        if latest:
            archive.writestr("meta", pb_varint(1, 3))
            archive.writestr("collection.anki21b", compressor.compress(db_path.read_bytes()))
            archive.writestr("collection.anki2", b"placeholder: please update Anki")
            entries = b"".join(
                pb_bytes(1, pb_bytes(1, name) + pb_varint(2, len(MEDIA[name])))
                for name in media_names
            )
            archive.writestr("media", compressor.compress(entries))
            for index, name in enumerate(media_names):
                # Media files are zstd-compressed in streaming mode (no content size header).
                buffer = io.BytesIO()
                with compressor.stream_writer(buffer, closefd=False) as writer:
                    writer.write(MEDIA[name])
                archive.writestr(str(index), buffer.getvalue())
        else:
            archive.write(db_path, "collection.anki21")
            archive.writestr("media", json.dumps({str(i): n for i, n in enumerate(media_names)}))
            for index, name in enumerate(media_names):
                archive.writestr(str(index), MEDIA[name])
    db_path.unlink()
    return target
