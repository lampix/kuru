"""Converting models to API schemas (bulk-loading related rows)."""

from __future__ import annotations

from collections.abc import Iterable, Sequence

from sqlmodel import Session, col, func, select

from kuru.models import Card, Deck, DeckConfig, Note, NoteType
from kuru.schemas.decks import NoteTypeOut, StudyCard
from kuru.schemas.presets import PresetOut
from kuru.schemas.scheduling import CardMemory
from kuru.services.fsrs import normalize_weights


def study_cards(session: Session, cards: Sequence[Card]) -> list[StudyCard]:
    """Serialise cards together with their note content."""
    note_ids = {card.note_id for card in cards}
    notes = (
        {n.id: n for n in session.exec(select(Note).where(col(Note.id).in_(note_ids)))}
        if note_ids
        else {}
    )
    result = []
    for card in cards:
        note = notes[card.note_id]
        assert card.id is not None
        result.append(
            StudyCard(
                id=card.id,
                note_id=card.note_id,
                deck_id=card.deck_id,
                ord=card.ord,
                note_type_id=note.note_type_id,
                fields=note.fields,
                tags=note.tags,
                memory=CardMemory.from_card(card),
                position=card.position,
                flags=card.flags,
            )
        )
    return result


def note_types_for(session: Session, note_type_ids: Iterable[int]) -> list[NoteTypeOut]:
    ids = set(note_type_ids)
    if not ids:
        return []
    return [
        note_type_out(nt) for nt in session.exec(select(NoteType).where(col(NoteType.id).in_(ids)))
    ]


def note_type_out(note_type: NoteType) -> NoteTypeOut:
    assert note_type.id is not None
    return NoteTypeOut(
        id=note_type.id,
        name=note_type.name,
        kind=int(note_type.kind),
        fields=note_type.fields,
        templates=note_type.templates,
        css=note_type.css,
        updated_at=note_type.updated_at,
    )


def preset_out(session: Session, preset: DeckConfig, default_id: int | None) -> PresetOut:
    deck_count = session.exec(
        select(func.count()).select_from(Deck).where(Deck.config_id == preset.id)
    ).one()
    data = {name: getattr(preset, name) for name in PresetOut.model_fields if hasattr(preset, name)}
    data.update(
        fsrs_weights=list(normalize_weights(preset.fsrs_weights)),
        weights_are_default=not preset.fsrs_weights,
        deck_count=deck_count,
        is_default=preset.id == default_id,
    )
    return PresetOut.model_validate(data)
