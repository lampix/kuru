"""SQLModel table definitions.

Importing this package registers every table on ``SQLModel.metadata`` (used by Alembic).
"""

from kuru.models.card import Card, CardState
from kuru.models.deck import Deck, DeckConfig, NewCardOrder
from kuru.models.import_job import ImportJob, ImportStatus
from kuru.models.media import MediaFile
from kuru.models.note import Note, NoteType, NoteTypeKind
from kuru.models.review import ReviewKind, ReviewLog
from kuru.models.user import User

__all__ = [
    "Card",
    "CardState",
    "Deck",
    "DeckConfig",
    "ImportJob",
    "ImportStatus",
    "MediaFile",
    "NewCardOrder",
    "Note",
    "NoteType",
    "NoteTypeKind",
    "ReviewKind",
    "ReviewLog",
    "User",
]
