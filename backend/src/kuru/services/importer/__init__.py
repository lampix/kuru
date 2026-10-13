"""Anki ``.apkg`` / ``.colpkg`` import pipeline.

``package`` opens archives of every Anki generation, ``reader`` turns the collection database into
schema-independent records, ``importer`` persists them and ``jobs`` runs imports in the background.
"""

from kuru.services.importer.importer import AnkiImporter, ImportStats, media_path
from kuru.services.importer.jobs import registry, run_import_job
from kuru.services.importer.package import InvalidPackageError, open_package

__all__ = [
    "AnkiImporter",
    "ImportStats",
    "InvalidPackageError",
    "media_path",
    "open_package",
    "registry",
    "run_import_job",
]
