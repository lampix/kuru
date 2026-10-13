"""A minimal protobuf wire-format decoder.

Anki ≥ 2.1.50 stores note types, decks and presets as protobuf blobs. We only need to *read* a
handful of fields, so a ~60 line decoder avoids generated code and the ``protobuf`` runtime.
Field numbers come from Anki's ``proto/anki/*.proto`` files.
"""

from __future__ import annotations

import struct
from collections import defaultdict
from dataclasses import dataclass, field

_VARINT, _I64, _LEN, _I32 = 0, 1, 2, 5


class ProtobufError(ValueError):
    """Raised for malformed input."""


def _read_varint(data: bytes, pos: int) -> tuple[int, int]:
    result = shift = 0
    while True:
        if pos >= len(data):
            raise ProtobufError("truncated varint")
        byte = data[pos]
        pos += 1
        result |= (byte & 0x7F) << shift
        if not byte & 0x80:
            return result, pos
        shift += 7
        if shift > 70:
            raise ProtobufError("varint too long")


@dataclass(slots=True)
class Message:
    """Decoded message: field number → list of raw values (int for varints, bytes otherwise)."""

    fields: dict[int, list[int | bytes]] = field(default_factory=lambda: defaultdict(list))

    @classmethod
    def parse(cls, data: bytes | None) -> Message:
        msg = cls()
        if not data:
            return msg
        pos = 0
        while pos < len(data):
            key, pos = _read_varint(data, pos)
            number, wire = key >> 3, key & 7
            value: int | bytes
            if wire == _VARINT:
                value, pos = _read_varint(data, pos)
            elif wire == _I64:
                value, pos = data[pos : pos + 8], pos + 8
            elif wire == _LEN:
                length, pos = _read_varint(data, pos)
                value, pos = data[pos : pos + length], pos + length
            elif wire == _I32:
                value, pos = data[pos : pos + 4], pos + 4
            else:
                raise ProtobufError(f"unsupported wire type {wire}")
            if pos > len(data):
                raise ProtobufError("truncated field")
            msg.fields[number].append(value)
        return msg

    def varint(self, number: int, default: int = 0) -> int:
        """Last varint value of a field (proto3 semantics: last one wins)."""
        values = [v for v in self.fields.get(number, []) if isinstance(v, int)]
        return values[-1] if values else default

    def sint64(self, number: int, default: int = 0) -> int:
        """Varint interpreted as a two's complement int64."""
        value = self.varint(number, default)
        return value - (1 << 64) if value >= 1 << 63 else value

    def flag(self, number: int) -> bool:
        return self.varint(number) != 0

    def raw(self, number: int) -> bytes | None:
        values = [v for v in self.fields.get(number, []) if isinstance(v, bytes)]
        return values[-1] if values else None

    def text(self, number: int, default: str = "") -> str:
        raw = self.raw(number)
        return raw.decode("utf-8", errors="replace") if raw is not None else default

    def message(self, number: int) -> Message | None:
        raw = self.raw(number)
        return Message.parse(raw) if raw is not None else None

    def messages(self, number: int) -> list[Message]:
        return [Message.parse(v) for v in self.fields.get(number, []) if isinstance(v, bytes)]

    def f32(self, number: int, default: float = 0.0) -> float:
        values = self.f32s(number)
        return values[-1] if values else default

    def f32s(self, number: int) -> list[float]:
        """Repeated ``float`` field, packed or unpacked."""
        out: list[float] = []
        for value in self.fields.get(number, []):
            if isinstance(value, bytes):
                count = len(value) // 4
                out.extend(struct.unpack(f"<{count}f", value[: count * 4]))
        return out

    def has(self, number: int) -> bool:
        return number in self.fields
