"""Opening ``.apkg`` / ``.colpkg`` archives.

Three on-disk generations exist:

========================  ========================  ===============  ======================
Package version           Collection file           Media map        Media files
========================  ========================  ===============  ======================
legacy 1 (Anki < 2.1)     ``collection.anki2``      JSON             plain
legacy 2 (Anki 2.1)       ``collection.anki21``     JSON             plain
latest (Anki ≥ 2.1.50)    ``collection.anki21b``    zstd protobuf    zstd-compressed
========================  ========================  ===============  ======================

Packages in the latest format also contain a placeholder ``collection.anki2`` telling old clients
to upgrade, so the newest collection file present always wins.
"""

from __future__ import annotations

import json
import shutil
import zipfile
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from enum import IntEnum
from pathlib import Path
from typing import IO

import zstandard

from kuru.services.importer.protobuf import Message


class PackageVersion(IntEnum):
    """Mirrors ``anki.import_export.PackageMetadata.Version``."""

    UNKNOWN = 0
    LEGACY_1 = 1
    LEGACY_2 = 2
    LATEST = 3


class InvalidPackageError(ValueError):
    """The file is not a readable Anki package."""


@dataclass(frozen=True, slots=True)
class MediaEntry:
    """A media file inside the archive."""

    filename: str
    archive_name: str


_COLLECTION_FILES = (
    ("collection.anki21b", PackageVersion.LATEST),
    ("collection.anki21", PackageVersion.LEGACY_2),
    ("collection.anki2", PackageVersion.LEGACY_1),
)
_MAX_MEDIA_MAP_BYTES = 256 * 1024 * 1024


class AnkiPackage:
    """A Anki package opened for reading. Use :func:`open_package`."""

    def __init__(self, archive: zipfile.ZipFile, workdir: Path) -> None:
        self._zip = archive
        self._workdir = workdir
        names = set(archive.namelist())
        self.version = self._detect_version(names)
        self.collection_path = self._extract_collection(names)
        self.media = self._read_media_map(names)

    def _detect_version(self, names: set[str]) -> PackageVersion:
        if "meta" in names:
            meta = Message.parse(self._zip.read("meta"))
            version = PackageVersion(meta.varint(1)) if meta.varint(1) in (1, 2, 3) else None
            if version is not None:
                return version
        for filename, version in _COLLECTION_FILES:
            if filename in names:
                return version
        raise InvalidPackageError("No Anki collection found in archive")

    def _extract_collection(self, names: set[str]) -> Path:
        target = self._workdir / "collection.sqlite"
        for filename, version in _COLLECTION_FILES:
            if filename not in names:
                continue
            with self._zip.open(filename) as source, target.open("wb") as out:
                if version == PackageVersion.LATEST:
                    zstandard.ZstdDecompressor().copy_stream(source, out)
                else:
                    shutil.copyfileobj(source, out, length=1024 * 1024)
            return target
        raise InvalidPackageError("No Anki collection found in archive")

    def _read_media_map(self, names: set[str]) -> list[MediaEntry]:
        if "media" not in names:
            return []
        info = self._zip.getinfo("media")
        if info.file_size > _MAX_MEDIA_MAP_BYTES:
            raise InvalidPackageError("Media map too large")
        raw = self._zip.read("media")
        if self.version == PackageVersion.LATEST:
            with zstandard.ZstdDecompressor().stream_reader(raw) as reader:
                data = reader.read(_MAX_MEDIA_MAP_BYTES)
            entries = Message.parse(data).messages(1)
            result = []
            for index, entry in enumerate(entries):
                archive_name = str(entry.varint(255, index)) if entry.has(255) else str(index)
                result.append(MediaEntry(filename=entry.text(1), archive_name=archive_name))
            return [e for e in result if e.archive_name in names and _safe_name(e.filename)]
        try:
            mapping: dict[str, str] = json.loads(raw or b"{}")
        except json.JSONDecodeError as exc:
            raise InvalidPackageError("Corrupt media map") from exc
        return [
            MediaEntry(filename=filename, archive_name=key)
            for key, filename in mapping.items()
            if key in names and _safe_name(filename)
        ]

    @contextmanager
    def open_media(self, entry: MediaEntry) -> Iterator[IO[bytes]]:
        """Open a media file for reading (decompressing if necessary)."""
        with self._zip.open(entry.archive_name) as raw:
            if self.version == PackageVersion.LATEST:
                with zstandard.ZstdDecompressor().stream_reader(raw) as reader:
                    yield reader
            else:
                yield raw


def _safe_name(filename: str) -> bool:
    """Media names are referenced from HTML; reject anything that looks like a path."""
    return (
        bool(filename)
        and "/" not in filename
        and "\\" not in filename
        and filename
        not in {
            ".",
            "..",
        }
    )


@contextmanager
def open_package(path: Path, workdir: Path) -> Iterator[AnkiPackage]:
    """Open an Anki package, extracting the collection database into ``workdir``."""
    try:
        archive = zipfile.ZipFile(path)
    except zipfile.BadZipFile as exc:
        raise InvalidPackageError("File is not a valid .apkg/.colpkg archive") from exc
    with archive:
        workdir.mkdir(parents=True, exist_ok=True)
        try:
            yield AnkiPackage(archive, workdir)
        finally:
            shutil.rmtree(workdir, ignore_errors=True)
